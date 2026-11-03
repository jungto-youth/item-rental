#!/usr/bin/env python3
"""구글시트 '(1) 물품리스트' → 정규화 원장(JSON/CSV) + 리포트 생성.

사용법:
    python3 build.py            # 캐시된 raw_items.json 으로 빌드
    python3 build.py --fetch    # Sheets API 로 다시 받아온 뒤 빌드

인증 (서비스 계정):
    GOOGLE_SA_KEY 환경변수 경로, 또는 아래 기본 경로의 서비스 계정 키 JSON.
    키의 client_email 을 시트에 '뷰어'로 공유해 두면 토큰 갱신 없이 동작한다.
      ~/.config/item-rental/google-sa.json
    (예전 /tmp/at.json 사용자 OAuth 토큰도 폴백으로 계속 지원)

참고:
    MCP(sheetsmcp) 가 Google Workspace Developer Preview Program 미등록으로
    막혀 있어 REST 를 직접 호출한다.

시트 레이아웃:
    컬럼은 위치(A~M)가 아니라 **헤더 이름**으로 찾는다. 시트가 개편되면
    (예: '갯수(25년파악)' → '수량', '대분류' 추가) 아래 FIELD_ALIASES 만 맞춰 주면 된다.
    헤더 행도 1행 고정이 아니라 '상품 ID' 가 있는 행을 자동 탐색한다.

산출물:
    raw_items.json       API 원본 스냅샷 (수정 금지 — 증거)
    items.json           정규화 원장 (canonical, 사람이 결정할 칸은 null)
    items.csv            시트 역기입/엑셀 편집용 평면 파일 (utf-8-sig)
    items.proposed.sql   items 테이블 INSERT 초안 (검토 후 실행)
    report.md            집계 + 사람이 결정해야 할 미결 목록
"""

import base64
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET_ID = "1FDH1_HFf2f2Cch__p_cYXRC4MAiWZ8NYgExES1nyItI"
SHEET_TAB = "(1) 물품리스트"
RANGE = "'%s'!A1:Z" % SHEET_TAB
SCOPES = ("https://www.googleapis.com/auth/spreadsheets",)
SA_KEY_CANDIDATES = (
    os.path.expanduser("~/.config/item-rental/google-sa.json"),
    "/tmp/at.json",
)

# 시트 헤더 이름 → 레코드 필드. 앞에서부터 먼저 발견되는 이름을 쓴다.
# (2026-10 개편: '갯수(26년/25년 파악)' → '수량', '대분류' 추가,
#  '향후 처리방안'·'지원팀장 의견' 삭제)
FIELD_ALIASES = OrderedDict(
    [
        ("id", ("상품 ID",)),
        ("name", ("상품 이름",)),
        ("size", ("사이즈/규격", "사이즈", "규격")),
        ("qty", ("수량", "갯수(26년 파악)", "갯수(26년파악)", "갯수(25년파악)")),
        ("major", ("대분류",)),
        ("category", ("분류",)),
        ("location", ("위치",)),
        ("status", ("상태",)),
        ("note", ("비고/특이사항", "비고")),
        ("plan", ("향후 처리방안", "처리방안")),
        ("opinion", ("지원팀장 의견", "팀장 의견")),
    ]
)
REQUIRED_FIELDS = ("name",)

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
UNIT_RE = re.compile(
    r"(\d+)\s*(봉지|세트|set|개|장|권|박스|통|켤레|쌍|매|병|팩|줄|자루|롤)\s*$"
)


def _b64url(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _sa_key_path():
    path = os.environ.get("GOOGLE_SA_KEY", "").strip()
    if path:
        return path
    for cand in SA_KEY_CANDIDATES:
        if os.path.exists(cand):
            return cand
    raise SystemExit(
        "서비스 계정 키를 찾지 못했습니다. GOOGLE_SA_KEY=/path/to/key.json 로 지정하세요."
    )


def _access_token(path):
    """서비스 계정 JWT(RS256) → access token. 외부 라이브러리 없이 openssl 로 서명."""
    with open(path, encoding="utf-8") as f:
        sa = json.load(f)
    if "accessToken" in sa:  # 예전 /tmp/at.json 형식
        return sa["accessToken"]
    now = int(time.time())
    claim = {
        "iss": sa["client_email"],
        "scope": " ".join(SCOPES),
        "aud": sa["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }
    signing_input = "%s.%s" % (
        _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()),
        _b64url(json.dumps(claim).encode()),
    )
    with tempfile.TemporaryDirectory() as d:
        key_file = os.path.join(d, "key.pem")
        fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(sa["private_key"])
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key_file],
            input=signing_input.encode(),
            capture_output=True,
            check=True,
        ).stdout
    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": "%s.%s" % (signing_input, _b64url(sig)),
        }
    ).encode()
    req = urllib.request.Request(
        sa["token_uri"],
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["access_token"]


def fetch():
    token = _access_token(_sa_key_path())
    url = (
        "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s"
        "?majorDimension=ROWS" % (SHEET_ID, urllib.parse.quote(RANGE))
    )
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def map_header(rows):
    """헤더 행을 찾아 {필드: 열인덱스} 를 만든다."""
    for row_idx, row in enumerate(rows[:10]):
        labels = [str(c).strip() for c in row]
        if labels and labels[0] == "상품 ID":
            colmap = {}
            for field, aliases in FIELD_ALIASES.items():
                for alias in aliases:
                    if alias in labels:
                        colmap[field] = labels.index(alias)
                        break
            missing = [f for f in REQUIRED_FIELDS if f not in colmap]
            if missing:
                raise SystemExit("헤더에 필수 컬럼이 없습니다: %s" % ", ".join(missing))
            return row_idx, colmap
    raise SystemExit("헤더 행('상품 ID' 로 시작)을 찾지 못했습니다.")


def parse_qty(raw):
    """자유 텍스트 갯수 → {total, unit, parts, confidence}.

    confidence: exact | at_least | derived | per_variant | complex | unknown
    """
    out = {
        "total": None,
        "unit": "",
        "parts": [],
        "variants": {},
        "confidence": "unknown",
    }
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
    if re.match(r"^각\s*\d", s) or " 각 " in s:
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

    # "1 (2XL)" — 수량 + 옵션 표기 (2026-10 개편 시트)
    m = re.fullmatch(r"(\d+)\s*[(\[]([^)\]]+)[)\]]", s)
    if m:
        out.update(
            total=int(m.group(1)),
            parts=[int(m.group(1))],
            variants={m.group(2).strip(): int(m.group(1))},
            confidence="exact",
        )
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


def _match_key(name, size):
    return (
        " ".join((name or "").split()).lower(),
        " ".join((size or "").split()).lower(),
    )


def load_id_ledger():
    """사람이 검토한 review.csv 의 ID를 (이름, 사이즈) 로 재사용한다.

    시트 '상품 ID' 칸이 비어 있어 ID를 행 순서로 매기면, 시트를 정렬·편집하는
    순간 기존 DB 행(items.source_key)과 어긋나 중복 생성된다.
    그래서 이미 결정된 ID를 먼저 물려주고, 새로 등장한 물품만 뒤 번호를 쓴다.
    """
    path = os.path.join(HERE, "review.csv")
    ledger = {}
    if not os.path.exists(path):
        return ledger
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            key = _match_key(row.get("원본이름"), row.get("원본사이즈"))
            if row.get("ID"):
                ledger.setdefault(key, row["ID"])
    return ledger


def build_records(raw, id_ledger=None):
    rows = raw.get("values", [])
    header_row, colmap = map_header(rows)
    labels = [str(c).strip() for c in rows[header_row]]
    records = []
    for offset, r in enumerate(rows[header_row + 1 :]):
        row = list(r) + [""] * (len(labels) - len(r))

        def cell(field):
            idx = colmap.get(field)
            return row[idx].strip() if idx is not None else ""

        name = cell("name")
        if not name:
            continue
        size = cell("size")
        qty = parse_qty(cell("qty"))
        size_parts = (
            [p.strip() for p in re.split(r"[/]", size) if p.strip()] if size else []
        )
        variants = dict(qty["variants"])
        if (
            not variants
            and qty["parts"]
            and len(qty["parts"]) == len(size_parts)
            and len(size_parts) > 1
        ):
            variants = dict(zip(size_parts, qty["parts"]))
        status_raw = cell("status")
        plan_raw = cell("plan")
        records.append(
            OrderedDict(
                [
                    ("id", cell("id") or None),  # 시트 '상품 ID' 칸에 역기입할 앵커
                    ("sheet_row", header_row + 1 + offset + 1),  # 실제 시트 행 번호
                    ("name", name),
                    ("size", size),
                    ("major_category", cell("major")),
                    ("category", cell("category")),
                    ("location", cell("location")),
                    ("status", STATUS_MAP.get(status_raw, "active")),
                    ("status_raw", status_raw),
                    (
                        "disposition",
                        parse_disposition(plan_raw)
                        if "plan" in colmap
                        else "unrecorded",
                    ),
                    ("disposition_raw", plan_raw),
                    ("qty_total", qty["total"]),
                    ("qty_unit", qty["unit"]),
                    ("qty_parts", qty["parts"]),
                    ("qty_variants", variants),
                    ("qty_raw", cell("qty")),
                    ("qty_confidence", qty["confidence"]),
                    ("note", cell("note")),
                    ("opinion", cell("opinion")),
                    ("rentable", None),  # ← 사람이 결정할 칸 (null = 미정)
                    ("photos", []),  # ← (2)물품사진 연동 자리
                    (
                        "raw",
                        {label: row[j] for j, label in enumerate(labels) if label},
                    ),
                ]
            )
        )
    assign_ids(records, id_ledger or {})
    return records


def assign_ids(records, id_ledger):
    """시트에 ID가 없는 행에 기존 ID → 새 번호 순으로 부여한다."""
    used = {rec["id"] for rec in records if rec["id"]}

    # 1) 기존 결정 ID를 먼저 예약 — 새 번호가 이 대역을 침범하지 않도록
    pending = [rec for rec in records if not rec["id"]]
    reserved = set()
    for rec in pending:
        candidate = id_ledger.get(_match_key(rec["name"], rec["size"]))
        if candidate and candidate not in used and candidate not in reserved:
            rec["id"] = candidate
            reserved.add(candidate)
    used |= reserved

    # 2) 새 번호는 시트·장부에 이미 쓰인 최대 번호 다음부터
    next_no = 1
    for known in used | set(id_ledger.values()):
        m = re.fullmatch(r"Y26-(\d+)", str(known))
        if m:
            next_no = max(next_no, int(m.group(1)) + 1)

    for rec in pending:
        if rec["id"]:
            continue
        while "Y26-%03d" % next_no in used:
            next_no += 1
        rec["id"] = "Y26-%03d" % next_no
        used.add(rec["id"])
        next_no += 1

    print(
        "  ID: 시트 기입 %d · review.csv 재사용 %d · 신규 부여 %d"
        % (len(records) - len(pending), len(reserved), len(pending) - len(reserved))
    )



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
    ("major_category", "대분류"),
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
    unrecorded = sum(1 for r in records if r["disposition"] == "unrecorded")
    if unrecorded:
        lines.insert(
            2,
            "-- 시트에 '향후 처리방안' 컬럼이 없어 %d건은 초안에서 제외했다"
            " (사람이 결정하기 전에는 대여 후보로 쓰지 않는다)." % unrecorded,
        )
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
    sheet_ids = sum(1 for r in records if (r["raw"].get("상품 ID") or "").strip())
    A(
        "| 상품 ID | %d / %d | %s |"
        % (
            sheet_ids,
            len(records),
            "**비어 있음** → 실행 시 부여한 `id`(Y26-###)를 역기입 권장"
            if sheet_ids == 0
            else "일부 기입 — 빈 행은 실행 시 부여한 `id` 사용",
        )
    )
    A(
        "| 사이즈/규격 | %d / %d | |"
        % (sum(1 for r in records if r["size"]), len(records))
    )
    A(
        "| 수량 | %d / %d | 빈값 %d건 |"
        % (
            sum(1 for r in records if r["qty_raw"]),
            len(records),
            sum(1 for r in records if not r["qty_raw"]),
        )
    )
    A(
        "| 대분류 | %d / %d | |"
        % (sum(1 for r in records if r["major_category"]), len(records))
    )
    A(
        "| 비고/특이사항 | %d / %d | |"
        % (sum(1 for r in records if r["note"]), len(records))
    )
    if any(r["disposition"] == "unrecorded" for r in records):
        A(
            "| 향후 처리방안 | **컬럼 없음** | 시트에서 삭제됨 → `disposition=unrecorded`"
            " (자동 대여 후보에서 제외) |"
        )
    else:
        A(
            "| 향후 처리방안 | %d / %d | 미정 %d건 |"
            % (
                sum(1 for r in records if r["disposition_raw"]),
                len(records),
                sum(1 for r in records if r["disposition"] == "undecided"),
            )
        )
    A(
        "| 지원팀장 의견 | %s | |"
        % (
            "%d / %d" % (sum(1 for r in records if r["opinion"]), len(records))
            if any("지원팀장 의견" in r["raw"] for r in records)
            else "**컬럼 없음**"
        )
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
    if any(r["disposition"] == "unrecorded" for r in records):
        A("### 3.3 향후 처리방안 — 시트에서 컬럼 삭제됨")
        A("")
        A(
            "이번 시트에는 '향후 처리방안' 컬럼이 없어 %d건 전부 `unrecorded` 다."
            % len(records)
        )
        A("대여 후보를 자동으로 만들지 않는다. `review.csv` 의 기존 결정을 기준으로 판단할 것.")
    else:
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
                sum(1 for r in rows if r["disposition"] not in ("undecided", "unrecorded")),
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
        "unrecorded": "시트에 처리방안 컬럼 없음",
    }
    for d, n in Counter(r["disposition"] for r in records).most_common():
        A("| `%s` | %s | %d |" % (d, meaning.get(d, d), n))
    A("")
    A("## 7. 시트 ↔ DB 매핑")
    A("")
    A(
        "`server/src` 기준 `items` 테이블 컬럼은 다음뿐이다 "
        "(v2.5에서 `category_id` 제거)."
    )
    A("")
    A("| 시트 | `items` | 처리 |")
    A("|---|---|---|")
    A("| 상품 이름 | `name` | 그대로 |")
    A("| 사이즈/규격 + 비고 | `description` | 합쳐서 1개 텍스트 |")
    A(
        "| 상태 (사용가능/고장) | `status` | `active` / `repair` (+ 이관·배부 완료 시 `retired`) |"
    )
    A("| 수량 | `total_qty` | 정수 파싱. 위 3.1 미확정건 제외 |")
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

    records = build_records(raw, load_id_ledger())
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
