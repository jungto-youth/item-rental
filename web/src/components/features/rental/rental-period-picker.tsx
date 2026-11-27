import { Show } from "solid-js";
import {
  addDaysIso,
  kstToday,
  maxDueDateKst,
  minDueDateKst,
} from "../../../../../shared/rental-period";
import { Chip } from "../../ui/chip";
import { Input } from "../../ui/input";

// 빠른 선택 — 서버 규칙(내일~30일) 안에서 가장 흔한 기간만 둔다.
const QUICK_DAYS = [1, 3, 7, 14, 30] as const;

function formatKoreanDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

// 반납 예정일 선택 — 빠른 선택 칩과 날짜 입력이 하나의 값을 공유한다.
// 칩은 '오늘 + N일'을 채우고, 날짜를 직접 고치면 해당하는 칩이 자동으로 켜진다.
export function RentalPeriodPicker(props: {
  value: string;
  onChange: (value: string) => void;
  class?: string;
}) {
  const today = kstToday();
  const quickOptions = QUICK_DAYS.map((days) => ({
    value: String(days),
    label: `${days}일`,
  }));
  const selectedDays = () => {
    const match = QUICK_DAYS.find(
      (days) => addDaysIso(today, days) === props.value,
    );
    return match ? String(match) : "";
  };

  return (
    <div class={`flex w-full flex-col gap-2 ${props.class ?? ""}`}>
      <span class="text-fine font-normal text-ink-2">대여 기간</span>
      <Chip
        value={selectedDays()}
        options={quickOptions}
        ariaLabel="대여 기간 빠른 선택"
        onChange={(value) => props.onChange(addDaysIso(today, Number(value)))}
      />
      <Input
        class="mt-1"
        label="반납 예정일 *"
        type="date"
        min={minDueDateKst()}
        max={maxDueDateKst()}
        value={props.value}
        onInput={props.onChange}
        required
      />
      <Show
        when={props.value}
        fallback={
          <p class="m-0 text-fine leading-normal text-ink-2">
            내일부터 30일 이내로 선택해 주세요.
          </p>
        }
      >
        <p class="m-0 text-fine leading-normal text-ink-2">
          <b class="font-semibold text-ink-1">
            {formatKoreanDate(props.value)}
          </b>
          에 반납 · 내일부터 30일 이내
        </p>
      </Show>
    </div>
  );
}
