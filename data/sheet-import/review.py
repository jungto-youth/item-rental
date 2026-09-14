#!/usr/bin/env python3
"""items.json → review.csv (사람 검토용) + import-plan.json

사이트(items 테이블)에 실제로 들어갈 값만 남기고, 결정이 필요한 건은 '반영' 컬럼으로 뺀다.
review.csv 를 엑셀/시트에서 검토·수정한 뒤 `deno run -A server/scripts/import-items.ts` 로 반영한다.

핵심 원칙
- description 은 회원에게 보이는 공개 필드다. 시트의 '비고/특이사항'·'지원팀장 의견'은
  내부 메모이므로 절대 넣지 않는다 (review.csv 의 내부메모 컬럼으로만 보존).
- items 테이블에 size/unit 컬럼이 없으므로 사이즈는 name 에 붙여 목록에서 구분되게 한다.
  (조끼 L/XL/2XL/3XL 이 전부 같은 이름이면 회원이 어느 사이즈를 빌리는지 알 수 없다)
- total_qty 는 NOT NULL CHECK(>=1) 이므로 수량 미확정 건은 반영 불가 → '보류'.

사용: python3 data/sheet-import/review.py [--target-id 기준경로]
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ITEMS = HERE / "items.json"
OUT_CSV = HERE / "review.csv"

# items.status 허용값 (server/src/routes/admin/items.ts ITEM_STATUS)
VALID_STATUS = ("active", "repair", "retired")
# SPEC §4.3 대여 기간 정책 기본값
DEFAULT_MAX_DAYS = 7
# 수량으로 인정하는 파싱 신뢰도
KNOWN_CONF = ("exact", "derived", "min")

# 사이즈가 이미 이름에 들어 있는지 판단할 때 쓰는 표기
SIZE_TOKENS = ("XL", "2XL", "3XL", "L", "M", "S", "혼합색상", "750ml", "15개", "8색")


def site_name(it: dict) -> str:
    """목록에서 구분되도록 사이즈를 이름에 붙인다."""
    name = " ".join(it["name"].split())  # 줄바꿈·중복 공백 정리
    size = " ".join(it["size"].split())
    if not size:
        return name
    # 이미 이름에 사이즈 표기가 있으면 중복해서 붙이지 않는다
    if size.upper() in name.upper():
        return name
    if any(tok.upper() == size.upper() for tok in SIZE_TOKENS):
        return f"{name} ({size})"
    return f"{name} (규격 {size})"


def site_description(it: dict) -> str:
    """회원에게 보이는 설명 — 사이즈/단위처럼 실제 이용에 필요한 정보만."""
    parts: list[str] = []
    size = " ".join(it["size"].split())
    if size:
        parts.append(f"규격: {size}")
    unit = (it.get("qty_unit") or "").strip()
    if unit:
        parts.append(f"단위: {unit}")
    if it["qty_confidence"] == "min":
        parts.append("수량은 하한(이상)으로 파악된 값입니다")
    return " / ".join(parts)


def warnings(it: dict, dup_names: dict[str, int]) -> list[str]:
    w: list[str] = []
    raw = it["name"]
    if "\n" in raw.strip():
        w.append("행분리필요(이름에 여러 줄)")
    if it["id"] and dup_names.get(it["name"], 0) > 1:
        w.append("이름중복")
    if it["status_raw"] == "고장" or "불량" in raw:
        w.append("불량→수리중 확인")
    if "?" in it["size"] or "몇" in it["size"]:
        w.append("사이즈불명")
    if it["qty_confidence"] not in KNOWN_CONF:
        w.append("수량미확정")
    if it["qty_confidence"] == "per_variant":
        w.append("변형별수량(총계불명)")
    if it["qty_confidence"] == "complex":
        w.append("복합서술(수동확인)")
    # 한 행에 색상/규격 변형이 뭉쳐 있으면 수량을 그대로 쓰면 안 된다 (예: 상장케이스 남색/분홍색 7개)
    if "/" in raw and it["qty_total"]:
        w.append("옵션혼합(수량 안분 확인)")
    if it.get("qty_unit"):
        w.append("단위있음")
    if it["note"] or it["opinion"]:
        w.append("내부메모있음")
    return w


def decide(it: dict) -> tuple[str, str]:
    """(반영, 사유) — 기본값만 정한다. 최종 결정은 사람이 review.csv 에서 한다."""
    if it["disposition"] != "undecided":
        return "X", f"처리방안 확정({it['disposition_raw']}) — 대여 대상 아님"
    if it["qty_confidence"] not in KNOWN_CONF or it["qty_total"] is None:
        return "보류", "수량 미확정 — total_qty 확정 후 반영"
    if it["qty_confidence"] == "min":
        return "O", "하한값으로 반영(수량 재확인 권장)"
    if "불량" in it["name"] or it["status_raw"] == "고장":
        return "O", "수리중(repair) 상태로 반영"
    if "\n" in it["name"].strip():
        return "보류", "한 행에 여러 물품 — 분리 후 반영"
    return "O", ""


HEADER = [
    "반영",  # O=반영 / X=제외 / 보류  ← 사람이 고치는 컬럼
    "ID",
    "사이트명",  # items.name
    "설명",  # items.description (공개)
    "수량",  # items.total_qty
    "최대대여일",  # items.max_days
    "상태",  # items.status
    "사유",
    "경고",
    "분류",  # items.category — 시트 '분류' 컬럼 값 그대로 (13개 고정값)
    "위치",  # items.location — 시트 '위치' 컬럼 (정토회관/용인창고 …)
    "원본이름",
    "원본사이즈",
    "원본수량",
    "원본처리방안",
    "내부메모_비고",
    "내부메모_의견",
]


def main() -> int:
    if not ITEMS.exists():
        print(
            f"items.json 없음 — 먼저 실행: python3 {HERE.name}/build.py --fetch",
            file=sys.stderr,
        )
        return 1

    data = json.loads(ITEMS.read_text(encoding="utf-8"))
    items: list[dict] = data["items"]

    dup_names: dict[str, int] = {}
    for it in items:
        dup_names[it["name"]] = dup_names.get(it["name"], 0) + 1

    rows: list[dict[str, str]] = []
    stats = {"O": 0, "X": 0, "보류": 0}
    for it in items:
        반영, 사유 = decide(it)
        stats[반영] += 1
        상태 = (
            "repair"
            if ("불량" in it["name"] or it["status_raw"] == "고장")
            else "active"
        )
        assert 상태 in VALID_STATUS
        rows.append(
            {
                "반영": 반영,
                "ID": it["id"],
                "사이트명": site_name(it),
                "설명": site_description(it),
                "수량": "" if it["qty_total"] is None else str(it["qty_total"]),
                "최대대여일": str(DEFAULT_MAX_DAYS),
                "상태": 상태,
                "사유": 사유,
                "경고": ", ".join(warnings(it, dup_names)),
                "분류": it["category"],
                "위치": it.get("location", "") or "",
                "원본이름": it["name"],
                "원본사이즈": it["size"],
                "원본수량": it["qty_raw"],
                "원본처리방안": it["disposition_raw"],
                "내부메모_비고": it["note"],
                "내부메모_의견": it["opinion"],
            }
        )

    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(
        f"review.csv 생성 — {len(rows)}건 (반영 {stats['O']} / 제외 {stats['X']} / 보류 {stats['보류']})"
    )
    print(f"  {OUT_CSV}")
    print("\n[검토 방법]")
    print("  1) review.csv 를 열어 '반영' 컬럼만 O / X / 보류 로 고친다")
    print("  2) '사이트명'·'설명'·'수량'·'최대대여일' 을 필요하면 수정한다")
    print(
        "  3) deno run -A server/scripts/import-items.ts          ← 미리보기(DB 변경 없음)"
    )
    print("     deno run -A server/scripts/import-items.ts --apply  ← 실제 반영")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
