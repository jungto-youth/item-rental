#!/usr/bin/env python3
"""구글시트 '(1) 물품리스트' → 정규화 원장(JSON/CSV) + 리포트 생성.

사용법:
    python3 build.py            # 캐시된 raw_items.json 으로 빌드
    python3 build.py --fetch    # Sheets API 로 다시 받아온 뒤 빌드

인증:
    /tmp/at.json = {"accessToken": "<OAuth 사용자 토큰>"}
    (OAuth 승인으로 받은 토큰. 만료 시 refresh 필요)

참고:
    MCP(sheetsmcp) 가 Google Workspace Developer Preview Program 미등록으로
    막혀 있어 REST 를 직접 호출한다. 승인되면 동일 범위를
    sheetsmcp_get_values(spreadsheetId, range="'(1) 물품리스트'!A1:M1043")
    로 그대로 대체 가능하다.

산출물:
    raw_items.json       API 원본 스냅샷 (수정 금지 — 증거)
    items.json           정규화 원장 (canonical, 사람이 결정할 칸은 null)
    items.csv            시트 역기입/엑셀 편집용 평면 파일 (utf-8-sig)
    items.proposed.sql   items 테이블 INSERT 초안 (검토 후 실행)
    report.md            집계 + 사람이 결정해야 할 미결 목록
"""

import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, OrderedDict

SHEET_ID = "1FDH1_HFf2f2Cch__p_cYXRC4MAiWZ8NYgExES1nyItI"
RANGE = "'(1) 물품리스트'!A1:M1043"
TOKEN_PATH = "/tmp/at.json"
HERE = os.path.dirname(os.path.abspath(__file__))

# 시트 컬럼 순서 (A~M)
COLS = [
    "상품 ID",
    "상품 이름",
    "사이즈/규격",
    "갯수(26년 파악)",
    "갯수(25년파악)",
    "분류",
    "위치",
    "상태",
    "비고/특이사항",
    "향후 처리방안",
    "지원팀장 의견",
    "1열",
    "2열",
]
(ID, NAME, SIZE, Q26, Q25, CAT, LOC, ST, NOTE, PLAN, OPIN, C1, C2) = range(13)

STATUS_MAP = {"사용가능": "active", "고장": "repair"}
DISPOSITION_MAP = OrderedDict(
    [
        ("배부", "giveaway"),
        ("JTS 이관", "transfer:jts"),
        ("행자원 이관", "transfer:haengjawon"),
        ("용인", "transfer:yongin"),
        ("", "undecided"),
    ]
)
UNIT_RE = re.compile(r"(\d+)\s*(봉지|세트|set|개|장|권|박스|통|켤레|쌍)\s*$")


def fetch():
    token = json.load(open(TOKEN_PATH))["accessToken"]
    url = (
        "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s?majorDimension=ROWS"
        % (SHEET_ID, urllib.parse.quote(RANGE))
    )
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def parse_qty(raw):
    """자유 텍스트 갯수 → {total, unit, parts, confidence}.

    confidence: exact | at_least | derived | per_variant | complex | unknown
    """
    out = {"total": None, "unit": "", "parts": [], "confidence": "unknown"}
    s = (raw or "").strip()
    if not s:
        return out

    # "10개 이상"
    if "이상" in s:
        nums = re.findall(r"\d+", s)
        if nums:
            out.update(total=int(nums[0]), confidence="at_least")
        return out

    # "각 1개" — 변형별 수량이라 총계 불명
    if s.startswith("각") or "각 " in s:
        nums = re.findall(r"\d+", s)
        out["parts"] = [int(n) for n in nums]
        out["confidence"] = "per_variant"
        return out

    # "3 / 3 / 2 / 5 / 3", "1, 3, 42", "14 / 6 / 1" — 숫자·구분자만
    if re.fullmatch(r"[\d\s/,·]+", s):
        nums = [int(n) for n in re.findall(r"\d+", s)]
        if len(nums) == 1:
            out.update(total=nums[0], confidence="exact")
        else:
            out.update(total=sum(nums), parts=nums, confidence="derived")
        return out

    # "1개" / "77개" / "1봉지" / "2 set"
    m = UNIT_RE.fullmatch(s)
    if m:
        out.update(total=int(m.group(1)), unit=m.group(2), confidence="exact")
        return out

    # "티: S 3개, M 2개, L 1개\n맨투맨: M 4개, L 5개" 같은 복합 서술
    nums = [int(n) for n in re.findall(r"\d+", s)]
    if nums:
        out.update(total=sum(nums), parts=nums, confidence="complex")
    return out


def parse_disposition(raw):
    s = (raw or "").strip()
    if s in DISPOSITION_MAP:
        return DISPOSITION_MAP[s]
    for key, val in DISPOSITION_MAP.items():
        if key and key in s:
            return val
    return "undecided"


def build_records(raw):
    rows = raw.get("values", [])
    header = rows[0]
    if header[:2] != ["상품 ID", "상품 이름"]:
        raise SystemExit("예상과 다른 헤더: %r" % (header[:3],))
    records = []
    for i, r in enumerate(rows[1:]):
        r = list(r) + [""] * (len(COLS) - len(r))
        name = r[NAME].strip()
        if not name:
            continue
        qty = parse_qty(r[Q25])
        size = r[SIZE].strip()
        size_parts = (
            [p.strip() for p in re.split(r"[/]", size) if p.strip()] if size else []
        )
        variants = {}
        if (
            qty["parts"]
            and len(qty["parts"]) == len(size_parts)
            and len(size_parts) > 1
        ):
            variants = dict(zip(size_parts, qty["parts"]))
        status_raw = r[ST].strip()
        records.append(
            OrderedDict(
                [
                    (
                        "id",
                        "Y26-%03d" % (len(records) + 1),
                    ),  # 시트 '상품 ID' 칸에 역기입할 앵커
                    ("sheet_row", i + 2),  # 원본 시트 실제 행 번호
                    ("name", name),
                    ("size", size),
                    ("category", r[CAT].strip()),
                    ("location", r[LOC].strip()),
                    ("status", STATUS_MAP.get(status_raw, "active")),
                    ("status_raw", status_raw),
                    ("disposition", parse_disposition(r[PLAN])),
                    ("disposition_raw", r[PLAN].strip()),
                    ("qty_total", qty["total"]),
                    ("qty_unit", qty["unit"]),
                    ("qty_parts", qty["parts"]),
                    ("qty_variants", variants),
                    ("qty_raw", r[Q25].strip()),
                    ("qty_confidence", qty["confidence"]),
                    ("note", r[NOTE].strip()),
                    ("opinion", r[OPIN].strip()),
                    ("rentable", None),  # ← 사람이 결정할 칸 (null = 미정)
                    ("photos", []),  # ← (2)물품사진 연동 자리
                    ("raw", {c: r[j] for j, c in enumerate(COLS)}),
                ]
            )
        )
    return records


def write_json(records):
    path = os.path.join(HERE, "items.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "source": SHEET_ID,
                "range": RANGE,
                "count": len(records),
                "items": records,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )
    return path


CSV_COLS = [
    ("id", "상품 ID"),
    ("sheet_row", "시트행"),
    ("name", "상품 이름"),
    ("size", "사이즈/규격"),
    ("category", "분류"),
    ("location", "위치"),
    ("status", "상태(정규화)"),
    ("status_raw", "상태(원본)"),
    ("disposition", "처리방안(정규화)"),
    ("disposition_raw", "처리방안(원본)"),
    ("qty_total", "수량"),
    ("qty_unit", "단위"),
    ("qty_raw", "수량(원본)"),
    ("qty_confidence", "수량신뢰도"),
    ("qty_variants", "옵션별수량"),
    ("rentable", "대여가능(결정)"),
    ("note", "비고/특이사항"),
    ("opinion", "지원팀장 의견"),
]


def write_csv(records):
    path = os.path.join(HERE, "items.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([label for _, label in CSV_COLS])
        for rec in records:
            row = []
            for key, _ in CSV_COLS:
                val = rec.get(key)
                if key == "qty_variants":
                    val = json.dumps(val, ensure_ascii=False) if val else ""
                elif val is None:
                    val = ""
                row.append(val)
            w.writerow(row)
    return path


def write_sql(records):
    """대여 후보(처리방안 미정 + 수량 파악됨)만 INSERT 초안으로 뽑는다."""
    path = os.path.join(HERE, "items.proposed.sql")
    candidates = [
        r for r in records if r["disposition"] == "undecided" and r["qty_total"]
    ]
    lines = [
        "-- 자동 생성 초안 — 그대로 실행하지 말 것.",
        "-- 처리방안이 '미정'이고 수량이 파악된 %d건만 담았다." % len(candidates),
        "-- 대여 대상이 아닌 항목(기념품/소모품/도서 등)은 실행 전에 삭제할 것.",
        "-- description 은 사이즈/규격 + 비고를 합친 값이다. max_days 는 정책값 7.",
        "",
    ]
    for r in candidates:
        desc = " / ".join(p for p in [r["size"], r["note"], r["location"]] if p)
        lines.append(
            "INSERT INTO items (name, description, status, total_qty, max_days)\n"
            "VALUES (%s, %s, %s, %d, 7);  -- %s | %s"
            % (
                _sql(r["name"]),
                _sql(desc),
                _sql(r["status"]),
                r["qty_total"],
                r["id"],
                r["category"],
            )
        )
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path, len(candidates)


def _sql(s):
    return "'" + (s or "").replace("'", "''") + "'" if s else "NULL"


def write_report(records, paths):
    conf = Counter(r["qty_confidence"] for r in records)
    need_review = [
        r for r in records if r["qty_confidence"] in ("per_variant", "complex")
    ]
    no_qty = [r for r in records if not r["qty_total"]]
    multi = [
        r
        for r in records
        if " / " in r["name"] or ("," in r["name"] and "(" in r["name"])
    ]

    L = []
    A = L.append
    A("# 물품리스트 정리 리포트")
    A("")
    A("- 원본: `%s` — `%s`" % (SHEET_ID, RANGE))
    A(
        "- 생성: `python3 data/sheet-import/build.py` (원본 스냅샷 `raw_items.json` 보존)"
    )
    A("- 레코드: **%d건**" % len(records))
    A("")
    A("## 1. 채워짐 현황 (시트 상태)")
    A("")
    A("| 컬럼 | 채워짐 | 비고 |")
    A("|---|---|---|")
    A("| 상품 ID | 0 / %d | **비어 있음** → `id`(Y26-###) 역기입 필요 |" % len(records))
    A(
        "| 사이즈/규격 | %d / %d | |"
        % (sum(1 for r in records if r["size"]), len(records))
    )
    A("| 갯수(26년 파악) | 0 / %d | **전부 미파악** |" % len(records))
    A(
        "| 갯수(25년파악) | %d / %d | |"
        % (sum(1 for r in records if r["qty_raw"]), len(records))
    )
    A(
        "| 비고/특이사항 | %d / %d | |"
        % (sum(1 for r in records if r["note"]), len(records))
    )
    A(
        "| 향후 처리방안 | %d / %d | 미정 %d건 |"
        % (
            sum(1 for r in records if r["disposition_raw"]),
            len(records),
            sum(1 for r in records if r["disposition"] == "undecided"),
        )
    )
    A(
        "| 지원팀장 의견 | %d / %d | |"
        % (sum(1 for r in records if r["opinion"]), len(records))
    )
    A("")
    A("## 2. 수량 파싱 결과")
    A("")
    for key, label in [
        ("exact", "정확 숫자"),
        ("at_least", "이상(하한)"),
        ("derived", "옵션 합산"),
        ("per_variant", "변형별(총계 불명)"),
        ("complex", "복합 서술(수동 확인)"),
        ("unknown", "빈값/판독 불가"),
    ]:
        A("- %s: %d건" % (label, conf.get(key, 0)))
    A("- **수량 미확정 %d건** — 대여 수량(`total_qty`)으로 쓸 수 없음" % len(no_qty))
    A("")
    A("## 3. 사람이 결정해야 할 것")
    A("")
    A("### 3.1 수량 수동 확인 (%d건)" % len(need_review))
    A("")
    A("| ID | 상품 | 사이즈 | 원본 수량 | 판독 |")
    A("|---|---|---|---|---|")
    for r in need_review:
        A(
            "| %s | %s | %s | `%s` | %s |"
            % (
                r["id"],
                r["name"].split("\n")[0][:34],
                r["size"][:22] or "-",
                r["qty_raw"].replace("\n", "⏎")[:40],
                r["qty_confidence"],
            )
        )
    A("")
    A("### 3.2 한 행에 여러 물품이 뭉쳐 있을 가능성 (%d건 확인 대상)" % len(multi))
    A("")
    for r in multi[:15]:
        A("- `%s` %s — %s" % (r["id"], r["name"].split("\n")[0][:50], r["category"]))
    if len(multi) > 15:
        A("- … 외 %d건 (`items.csv` 참조)" % (len(multi) - 15))
    A("")
    A(
        "### 3.3 향후 처리방안 미정 (%d건)"
        % sum(1 for r in records if r["disposition"] == "undecided")
    )
    A("")
    A("대여 후보로 쓸지, 배부/이관할지 결정해야 한다.")
    A("")
    A("### 3.4 대여가능 여부 (`rentable`)")
    A("")
    A("`items.json` 의 `rentable` 은 전부 `null` — **의도적으로 비워 둔 결정 칸**이다.")
    A(
        "자동 추정하지 않았다: 같은 분류라도 조끼는 대여 대상, 기념품 티셔츠는 배부 대상처럼"
    )
    A("분류만으로 갈리지 않고, 잘못 추정하면 대여 불가 물품이 사이트에 노출된다.")
    A("")
    A("## 4. 분류별 현황")
    A("")
    A("| 분류 | 건수 | 수량 파악 | 처리방안 확정 |")
    A("|---|---|---|---|")
    for cat, n in Counter(r["category"] for r in records).most_common():
        rows = [r for r in records if r["category"] == cat]
        A(
            "| %s | %d | %d | %d |"
            % (
                cat or "(빈값)",
                n,
                sum(1 for r in rows if r["qty_total"]),
                sum(1 for r in rows if r["disposition"] != "undecided"),
            )
        )
    A("")
    A("## 5. 위치별 현황")
    A("")
    for loc, n in Counter(r["location"] or "(빈값)" for r in records).most_common():
        A("- %s: %d건" % (loc, n))
    A("")
    A("## 6. 처리방안별 현황")
    A("")
    A("| 정규화 | 의미 | 건수 |")
    A("|---|---|---|")
    meaning = {
        "giveaway": "배부",
        "transfer:jts": "JTS 이관",
        "transfer:haengjawon": "행자원 이관",
        "transfer:yongin": "용인창고",
        "undecided": "미정",
    }
    for d, n in Counter(r["disposition"] for r in records).most_common():
        A("| `%s` | %s | %d |" % (d, meaning.get(d, d), n))
    A("")
    A("## 7. 시트 ↔ DB 매핑")
    A("")
    A(
        "`server/src` 기준 `items` 테이블 컬럼은 다음뿐이다 "
        "(v2.5에서 `category_id` 제거, SPEC §8)."
    )
    A("")
    A("| 시트 | `items` | 처리 |")
    A("|---|---|---|")
    A("| 상품 이름 | `name` | 그대로 |")
    A("| 사이즈/규격 + 비고 | `description` | 합쳐서 1개 텍스트 |")
    A(
        "| 상태 (사용가능/고장) | `status` | `active` / `repair` (+ 이관·배부 완료 시 `retired`) |"
    )
    A("| 갯수 | `total_qty` | 정수 파싱. 위 3.1 미확정건 제외 |")
    A("| — | `max_days` | 시트에 없음 → 정책값 7 |")
    A("| 분류 | (없음) | 앱에는 카테고리 없음 — 물리 정리용으로만 유지 |")
    A("| 위치 | (없음) | 보관 장소를 앱에 노출하려면 별도 필드 필요 (v2 후보) |")
    A("| 향후 처리방안 | `status` 보조 | 배부/이관 확정 건은 대여 목록에서 제외 |")
    A("")
    A("### 2025 참고 시트와의 차이")
    A("")
    A(
        "`(참고)2025하반기` 는 `순번 / 자산카드번호 / 위치번호 / 품명 / 수량 / 단위` 형식이었다. "
        "2026 물품리스트엔 **자산카드번호·위치번호·단위가 빠졌다**. "
        "물리 정리(P1, 분류별 집약·위치 배정)를 하려면 위치번호 체계를 복원하는 편이 낫다."
    )
    A("")
    A("## 8. 산출물")
    A("")
    A("| 파일 | 용도 |")
    A("|---|---|")
    A("| `raw_items.json` | API 원본 스냅샷 — 수정 금지 |")
    A("| `items.json` | 정규화 원장(정본). 원본 셀을 `raw` 에 보존 |")
    A("| `items.csv` | 엑셀/시트 재편집·역기입용 (utf-8-sig) |")
    A(
        "| `items.proposed.sql` | `items` INSERT 초안 (%d건, 검토 후 실행) |"
        % paths.get("sql_count", 0)
    )
    A("| `report.md` | 이 문서 |")
    A("")
    path = os.path.join(HERE, "report.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return path


def main():
    if "--fetch" in sys.argv or not os.path.exists(
        os.path.join(HERE, "raw_items.json")
    ):
        raw = fetch()
        with open(os.path.join(HERE, "raw_items.json"), "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=1)
        print("fetched via Sheets REST")
    else:
        with open(os.path.join(HERE, "raw_items.json"), encoding="utf-8") as f:
            raw = json.load(f)
        print("using cached raw_items.json (--fetch 로 갱신)")

    records = build_records(raw)
    write_json(records)
    write_csv(records)
    _, n_sql = write_sql(records)
    write_report(records, {"sql_count": n_sql})
    print(
        "items.json / items.csv / items.proposed.sql / report.md  (%d건, SQL %d건)"
        % (len(records), n_sql)
    )


if __name__ == "__main__":
    main()
