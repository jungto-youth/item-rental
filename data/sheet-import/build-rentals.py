#!/usr/bin/env python3
"""raw_festa.json → review-rentals.csv (과거 대여 이력 검토용)

2025 청년페스타 '물품대여' 탭(218행)을 rental_history 테이블에 넣기 전에
사람이 검토할 수 있는 CSV 로 만든다. review.csv 와 같은 방식으로
'반영' 컬럼이 게이트 역할을 한다 (O=반영 / X=제외 / 보류).

핵심 원칙
- 이 데이터는 '과거 사실'의 스냅샷이다. 원본 값을 고치지 않고 정규화만 한다.
  파싱 결과는 원본_* 컬럼에 나란히 두어 사람이 대조할 수 있게 한다.
- 날짜·수량은 파싱 실패 시 비워 둔다(rental_history 는 NULL 을 허용한다).
  값을 추정해서 채우지 않는다 — 잘못된 날짜는 없는 날짜보다 나쁘다.
- item_id 연결은 여기서 하지 않는다(DB 접근이 없다). 물품ID 컬럼을 비워 두면
  import-rentals.ts 가 이름으로 best-effort 매칭한다. 사람이 채우면 그 값이 우선한다.

원본 시트의 날짜 표기(파싱 대상)
  2025.10.28            → YYYY.M.D
  45956.0               → 엑셀 시리얼(기준 1899-12-30)
  2.0251021E7           → 지수 표기로 뭉개진 20251021
  11-7-18:00            → 연도 없는 M-D-HH:MM (행사 연도 2025 로 해석)
  2025.11.7. 12:00      → 마침표·공백 혼용

사용: python3 data/sheet-import/build-rentals.py
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw_festa.json"
OUT_CSV = HERE / "review-rentals.csv"

TAB = "(2025)물품대여"
# 시트에 '신청일' 연도가 생략된 행이 있어 행사 연도로 보정한다
EVENT_YEAR = 2025
# 엑셀 시리얼 기준일 (엑셀의 1900 윤년 버그를 반영한 관용 기준)
EXCEL_EPOCH = dt.date(1899, 12, 30)
# 시리얼로 인정할 범위 — 2025~2026년대 값만 (오파싱 방지)
SERIAL_MIN, SERIAL_MAX = 45000, 47000

# 컬럼 인덱스 (raw_festa.json 의 헤더 순서)
C_ORG, C_MEMBER, C_SCOPE, C_REQUESTED, C_ITEM = 0, 1, 2, 3, 4
C_QTY, C_START, C_END, C_USE_LOC, C_NOTE = 5, 6, 7, 8, 9
C_PROCURE, C_INTERNAL, C_RETURN_LOC, C_CHECKOUT, C_RETURNED = 10, 11, 13, 14, 15


def cell(row: list[str], i: int) -> str:
    return (row[i] if i < len(row) else "") or ""


def clean(v: str) -> str:
    """줄바꿈·중복 공백 정리. 원본 셀에 개행이 섞여 있다."""
    return " ".join(v.split())


# 값 대신 셀에 들어 있는 자리표시자 — 텍스트 필드에서만 비운다.
# 원본_* 컬럼에는 그대로 남겨 사람이 원본과 대조할 수 있게 한다.
# 주의: 'X' 는 출고·반납 상태를 나타내는 실제 값이라 자리표시자에 넣지 않는다.
PLACEHOLDERS = {
    "/",
    "//",
    "-",
    "--",
    "—",
    "–",
    "·",
    "ㆍ",
    ".",
    "없음",
    "n/a",
}


def text(v: str) -> str:
    """텍스트 필드용 정리 — 자리표시자('/' 등)는 빈 값으로 본다."""
    s = clean(v)
    return "" if s.lower() in PLACEHOLDERS else s


def to_int(v) -> int | None:
    """문자열→정수. 변환 불가면 None (예외를 밖으로 던지지 않는다)."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def parse_int(v: str) -> int | None:
    v = clean(v)
    if not v:
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    # 시트 수량은 '1.0' 처럼 실수로 저장돼 있다. nan·inf 는 is_integer() 가 False.
    if not f.is_integer():
        return None
    try:
        return int(f)
    except (ValueError, OverflowError):
        return None


def serial_to_date(n: int) -> dt.date | None:
    if SERIAL_MIN <= n <= SERIAL_MAX:
        return EXCEL_EPOCH + dt.timedelta(days=n)
    return None


def parse_date(v: str) -> dt.date | None:
    """'신청일' — 날짜만. 실패하면 None."""
    v = clean(v)
    if not v:
        return None
    # 지수 표기: '2.0251021E7' → 20251021
    if re.fullmatch(r"[\d.]+\s*[Ee]\+?\d+", v):
        try:
            s = str(int(float(v)))
        except ValueError:
            return None
        if len(s) == 8:
            try:
                return dt.date(int(s[:4]), int(s[4:6]), int(s[6:]))
            except ValueError:
                return None
        return None
    # YYYY.M.D (마침표 뒤 공백·끝 마침표 허용)
    m = re.fullmatch(r"(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?", v)
    if m:
        try:
            return dt.date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    # 엑셀 시리얼
    m = re.fullmatch(r"(\d{4,6})(?:\.0+)?", v)
    if m:
        n = to_int(m[1])
        return serial_to_date(n) if n is not None else None
    return None


def parse_dt(v: str) -> dt.datetime | None:
    """사용 시작/종료 일시. 시간이 없으면 00:00 으로 둔다. 실패하면 None."""
    v = clean(v)
    if not v:
        return None
    # 연도 없는 M-D-HH:MM — '11-7-18:00' → 2025-11-07 18:00
    m = re.fullmatch(r"(\d{1,2})-(\d{1,2})-(\d{1,2}):(\d{2})", v)
    if m:
        mo = to_int(m[1])
        day = to_int(m[2])
        hh = to_int(m[3])
        mi = to_int(m[4])
        # '11-0-10:00' 처럼 일(day)이 0 인 원본 오류가 있다 — 추정하지 않고 버린다
        if mo is None or day is None or hh is None or mi is None or day == 0:
            return None
        try:
            return dt.datetime(EVENT_YEAR, mo, day, hh, mi)
        except ValueError:
            return None
    # YYYY.M.D[.] [HH:MM]
    m = re.fullmatch(
        r"(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(?:(\d{1,2}):(\d{2}))?", v
    )
    if m:
        try:
            return dt.datetime(
                int(m[1]),
                int(m[2]),
                int(m[3]),
                int(m[4]) if m[4] else 0,
                int(m[5]) if m[5] else 0,
            )
        except ValueError:
            return None
    # 엑셀 시리얼 (날짜만)
    m = re.fullmatch(r"(\d{4,6})(?:\.0+)?", v)
    if m:
        n = to_int(m[1])
        d = serial_to_date(n) if n is not None else None
        if d:
            return dt.datetime.combine(d, dt.time())
    return None


def warnings(row: list[str], requested, start, end, qty, item_name: str) -> list[str]:
    w: list[str] = []
    if not requested and text(cell(row, C_REQUESTED)):
        w.append("신청일파싱실패")
    if not start and text(cell(row, C_START)):
        w.append("시작파싱실패")
    if not end and text(cell(row, C_END)):
        w.append("종료파싱실패")
    if start and end and start > end:
        w.append("시작>종료")
    if qty is None:
        w.append("수량없음")
    if text(cell(row, C_CHECKOUT)) not in ("", "O", "X"):
        w.append("출고상태이상")
    if not text(cell(row, C_USE_LOC)):
        w.append("사용위치없음")
    if ">" in item_name:
        w.append("복합품목(한 셀에 여러 물품)")
    return w


HEADER = [
    "반영",  # O=반영 / X=제외 / 보류  ← 사람이 고치는 컬럼
    "ID",  # rental_history.source_key
    "신청자",  # member_name (스냅샷)
    "소속",  # org
    "구분",  # item_scope — 회관물품 / 청년물품
    "대여물품",  # item_name (스냅샷)
    "수량",  # qty
    "신청일",  # requested_on  (정규화)
    "시작일시",  # start_at      (정규화)
    "종료일시",  # end_at        (정규화)
    "사용위치",  # use_location
    "물품ID",  # item_id — 비우면 이름으로 자동 매칭, 채우면 그 값 우선
    "경고",
    "사유",
    "조달여부",
    "출고상태",
    "반납여부",
    "반납위치",
    "비고",
    "내부메모",  # 정희정 확인 — 내부 메모
    "원본행",
    "원본_신청일",
    "원본_기간",
    "원본_수량",
]


def main() -> int:
    if not RAW.exists():
        print(f"raw_festa.json 없음: {RAW}", file=sys.stderr)
        return 1

    try:
        data = json.loads(RAW.read_text(encoding="utf-8"))
        rows: list[list[str]] = data["tabs"][TAB]
    except (json.JSONDecodeError, KeyError, UnicodeDecodeError, OSError) as e:
        print(f"raw_festa.json 을 읽을 수 없습니다: {e}", file=sys.stderr)
        return 1

    # 헤더가 예상과 다르면 컬럼 인덱스가 어긋난 것이다 — 조용히 잘못 넣느니 멈춘다
    header = [clean(h) for h in rows[1]]
    expect = {
        C_ORG: "소속",
        C_MEMBER: "신청자",
        C_SCOPE: "청년/회관물품",
        C_REQUESTED: "신청일(오늘날짜)",
        C_ITEM: "대여물품",
        C_QTY: "수량",
        C_START: "사용 시작일시",
        C_END: "종료일시",
    }
    for idx, name in expect.items():
        actual = cell(header, idx)
        if actual != name:
            print(
                f"헤더 불일치 — {idx}열 기대 '{name}' 실제 '{actual}'. "
                "시트 구조가 바뀌었습니다.",
                file=sys.stderr,
            )
            return 1

    body = rows[2:]
    out: list[dict[str, str]] = []
    stats = {"O": 0, "X": 0, "보류": 0}
    skipped_example = 0
    placeholders = 0

    for offset, row in enumerate(body):
        excel_row = offset + 3  # rows[0]=1행, rows[1]=헤더 → 첫 데이터는 3행
        member_raw = clean(cell(row, C_MEMBER))
        if not member_raw:
            continue
        member = text(member_raw)
        # 템플릿 예시 행 ('ex) O', 'ex) 7층 회의실1 / O') 은 실데이터가 아니다
        if any(clean(c).startswith("ex)") for c in row if c):
            skipped_example += 1
            continue

        item_name = text(cell(row, C_ITEM))
        requested = parse_date(cell(row, C_REQUESTED))
        start = parse_dt(cell(row, C_START))
        end = parse_dt(cell(row, C_END))
        qty = parse_int(cell(row, C_QTY))
        # 자리표시자('/' 등)를 비운 셀 수 — 원본_* 컬럼에는 그대로 남는다
        placeholders += sum(
            1
            for i in (
                C_ORG,
                C_SCOPE,
                C_ITEM,
                C_USE_LOC,
                C_PROCURE,
                C_INTERNAL,
                C_RETURN_LOC,
                C_CHECKOUT,
                C_RETURNED,
                C_NOTE,
            )
            if clean(cell(row, i)) and not text(cell(row, i))
        )
        w = warnings(row, requested, start, end, qty, item_name)

        if not item_name:
            반영, 사유 = "보류", "대여물품이 비었습니다"
        else:
            반영, 사유 = "O", ""
        stats[반영] += 1

        out.append(
            {
                "반영": 반영,
                "ID": f"F25-{excel_row:03d}",
                "신청자": member,
                "소속": text(cell(row, C_ORG)),
                "구분": text(cell(row, C_SCOPE)),
                "대여물품": item_name,
                "수량": "" if qty is None else str(qty),
                "신청일": requested.isoformat() if requested else "",
                "시작일시": start.strftime("%Y-%m-%d %H:%M") if start else "",
                "종료일시": end.strftime("%Y-%m-%d %H:%M") if end else "",
                "사용위치": text(cell(row, C_USE_LOC)),
                "물품ID": "",
                "경고": ", ".join(w),
                "사유": 사유,
                "조달여부": text(cell(row, C_PROCURE)),
                "출고상태": text(cell(row, C_CHECKOUT)),
                "반납여부": text(cell(row, C_RETURNED)),
                "반납위치": text(cell(row, C_RETURN_LOC)),
                "비고": text(cell(row, C_NOTE)),
                "내부메모": text(cell(row, C_INTERNAL)),
                "원본행": str(excel_row),
                "원본_신청일": clean(cell(row, C_REQUESTED)),
                "원본_기간": f"{clean(cell(row, C_START))} → {clean(cell(row, C_END))}",
                "원본_수량": clean(cell(row, C_QTY)),
            }
        )

    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, extrasaction="ignore")
        w.writeheader()
        w.writerows(out)

    print(
        f"review-rentals.csv 생성 — {len(out)}건 "
        f"(반영 {stats['O']} / 제외 {stats['X']} / 보류 {stats['보류']})"
    )
    print(f"  템플릿 예시 행 {skipped_example}건 제외")
    print(f"  자리표시자('/' 등) 비움 {placeholders}셀")
    print(f"  {OUT_CSV}")

    parsefail = sum(1 for r in out if "파싱실패" in r["경고"])
    print("\n[파싱 현황]")
    print(f"  신청일 채움 {sum(1 for r in out if r['신청일'])}/{len(out)}")
    print(f"  시작일시 채움 {sum(1 for r in out if r['시작일시'])}/{len(out)}")
    print(f"  종료일시 채움 {sum(1 for r in out if r['종료일시'])}/{len(out)}")
    print(f"  수량 채움 {sum(1 for r in out if r['수량'])}/{len(out)}")
    print(f"  날짜 파싱 실패 {parsefail}건 (경고 컬럼 참조)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
