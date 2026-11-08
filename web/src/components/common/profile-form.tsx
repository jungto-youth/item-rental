import { Show, createSignal, untrack } from "solid-js";
import { api } from "../../api/client";
import { session } from "../../context/session";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { CheckIcon } from "../icons";
import {
  AFFILIATION_PART_MAX,
  BRANCHES,
  DIVISIONS,
  customPartIssue,
  groupsOf,
  isValidAffiliation,
  isValidAffiliationPair,
  parseAffiliation,
  type CustomPartIssue,
} from "../../../../shared/affiliation";

type Props = {
  initialName?: string;
  initialPhone?: string;
  initialAffiliation?: string;
  title?: string;
  hint?: string;
  submitLabel?: string;
  cancellable?: boolean;
  email?: string;
  accountLabel?: string;
  accountVerified?: boolean;
  avatar?: boolean;
  note?: string;
  class?: string;
  onSaved?: () => void;
  onCancel?: () => void;
};

// 이름·연락처·지부·지회·모둠 폼 — 온보딩(/signup/profile)과 내 정보 수정(mypage) 공용.
export function ProfileForm(props: Props) {
  const initialAffiliation = untrack(() => parseAffiliation(props.initialAffiliation));
  const initialCustom = initialAffiliation.division === "대중지부";
  const [name, setName] = createSignal(untrack(() => props.initialName ?? ""));
  const [phone, setPhone] = createSignal(untrack(() => props.initialPhone ?? ""));
  const [division, setDivision] = createSignal<string>(initialAffiliation.division);
  // 청년지부 select 값과 대중지부 자유 입력 값을 따로 보관해, 지부를 오갈 때 입력이 사라지지 않게 한다.
  const [branch, setBranch] = createSignal(initialCustom ? "" : initialAffiliation.branch);
  const [group, setGroup] = createSignal(initialCustom ? "" : initialAffiliation.group);
  const [customBranch, setCustomBranch] = createSignal(
    initialCustom ? initialAffiliation.branch : "",
  );
  const [customGroup, setCustomGroup] = createSignal(
    initialCustom ? initialAffiliation.group : "",
  );
  const [nameError, setNameError] = createSignal("");
  const [phoneError, setPhoneError] = createSignal("");
  const [divisionError, setDivisionError] = createSignal("");
  const [branchError, setBranchError] = createSignal("");
  const [groupError, setGroupError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const initial = () => (name() || props.email || "").trim().charAt(0).toUpperCase();
  const hint = () => props.hint ?? "대여 연락 목적으로만 사용됩니다";

  const branchOptions = BRANCHES;
  const groupOptions = () => groupsOf(branch());
  const isPublic = () => division() === "대중지부";

  const changeDivision = (value: string) => {
    setDivision(value);
    if (value) setDivisionError("");
    setBranchError("");
    setGroupError("");
  };

  // 지회를 바꾸면 이전 모둠이 새 지회에 없을 수 있다 — 그때는 비워 다시 고르게 한다.
  const changeBranch = (value: string) => {
    setBranch(value);
    if (value) setBranchError("");
    if (!groupsOf(value).includes(group())) setGroup("");
  };

  const changeGroup = (value: string) => {
    setGroup(value);
    if (value) setGroupError("");
  };

  const changeCustomBranch = (value: string) => {
    setCustomBranch(value);
    if (value.trim()) setBranchError("");
  };

  const changeCustomGroup = (value: string) => {
    setCustomGroup(value);
    if (value.trim()) setGroupError("");
  };

  const customPartMessage = (label: "지회" | "모둠", issue: CustomPartIssue | null) => {
    if (!issue) return "";
    const object = label === "모둠" ? "을" : "를";
    const topic = label === "모둠" ? "은" : "는";
    if (issue === "required") return `${label}${object} 입력해 주세요`;
    if (issue === "too_long")
      return `${label}${topic} ${AFFILIATION_PART_MAX}자 이내로 입력해 주세요`;
    return `${label}에는 '·'와 줄바꿈을 사용할 수 없습니다`;
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;
    const nameText = name().trim();
    const phoneText = phone().trim();
    const divisionValue = division();
    const youth = divisionValue === "청년지부";
    const publicDivision = divisionValue === "대중지부";
    const branchValue = youth ? branch() : publicDivision ? customBranch().trim() : "";
    const groupValue = youth ? group() : publicDivision ? customGroup().trim() : "";

    setNameError(nameText ? "" : "이름을 입력해 주세요");
    setPhoneError(phoneText ? "" : "연락처를 입력해 주세요");
    setDivisionError(divisionValue ? "" : "지부를 선택해 주세요");

    if (youth) {
      setBranchError(branchValue ? "" : "지회를 선택해 주세요");
      setGroupError(
        !groupValue
          ? "모둠을 선택해 주세요"
          : isValidAffiliationPair(branchValue, groupValue)
            ? ""
            : "모둠을 다시 선택해 주세요",
      );
    } else if (publicDivision) {
      setBranchError(customPartMessage("지회", customPartIssue(branchValue)));
      setGroupError(customPartMessage("모둠", customPartIssue(groupValue)));
    } else {
      setBranchError("");
      setGroupError("");
    }

    if (
      !nameText ||
      !phoneText ||
      !divisionValue ||
      !isValidAffiliation(divisionValue, branchValue, groupValue)
    )
      return;

    setBusy(true);
    setMessage("");
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: nameText,
          phone: phoneText,
          division: divisionValue,
          branch: branchValue,
          group: groupValue,
        }),
      });
      await session.refresh();
      props.onSaved?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const heading = () => (
    <Show when={props.title}>
      <div class="mb-2 flex items-center gap-4">
        <Show when={props.avatar}>
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-body font-semibold text-primary-strong"
            aria-hidden="true"
          >
            {initial()}
          </span>
        </Show>
        <div>
          <h2 class="m-0 text-heading font-semibold tracking-tight">
            {props.title}
          </h2>
          <Show when={hint()}>
            <p class="mt-2 text-fine text-ink-2">{hint()}</p>
          </Show>
        </div>
      </div>
    </Show>
  );

  return (
    <form
      class={`profile-form flex flex-col gap-4 rounded-card border border-line bg-surface p-6 max-sm:p-4 ${props.class ?? ""}`}
      onSubmit={submit}
    >
      {heading()}
      <Show when={props.email}>
        <div class="flex items-center gap-2 rounded-card bg-surface-muted px-4 py-2 text-fine text-ink-2">
          <Show when={props.accountVerified}>
            <CheckIcon class="size-4 shrink-0 text-primary-strong" />
          </Show>
          <span class="shrink-0 whitespace-nowrap">
            {props.accountLabel ?? "이메일"}
          </span>
          <span class="ml-auto min-w-0 truncate text-ink-1" title={props.email}>
            {props.email}
          </span>
        </div>
      </Show>

      <div class="flex flex-col gap-2">
        <Input
          label="이름 *"
          required
          invalid={!!nameError()}
          value={name()}
          onInput={(value) => {
            setName(value);
            if (value.trim()) setNameError("");
          }}
        />
        <Show when={nameError()}>
          <p class="m-0 text-fine leading-normal text-danger" role="alert">
            {nameError()}
          </p>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <Input
          label="휴대폰 번호 *"
          type="tel"
          inputmode="tel"
          placeholder="010-1234-5678"
          required
          invalid={!!phoneError()}
          value={phone()}
          onInput={(value) => {
            setPhone(value);
            if (value.trim()) setPhoneError("");
          }}
        />
        <Show when={phoneError()}>
          <p class="m-0 text-fine leading-normal text-danger" role="alert">
            {phoneError()}
          </p>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <Select
          label="지부 *"
          required
          placeholder="선택"
          options={DIVISIONS}
          value={division()}
          invalid={!!divisionError()}
          onChange={changeDivision}
        />
        <Show when={divisionError()}>
          <p class="m-0 text-fine leading-normal text-danger" role="alert">
            {divisionError()}
          </p>
        </Show>
      </div>

      <div class="grid grid-cols-2 items-start gap-2">
        <Show
          when={isPublic()}
          fallback={
            <>
              <div class="flex min-w-0 flex-col gap-2">
                <Select
                  label="지회 *"
                  required
                  placeholder={division() ? "선택" : "지부 먼저"}
                  options={branchOptions}
                  value={branch()}
                  disabled={!division()}
                  invalid={!!branchError()}
                  onChange={changeBranch}
                />
                <Show when={branchError()}>
                  <p class="m-0 text-fine leading-normal text-danger" role="alert">
                    {branchError()}
                  </p>
                </Show>
              </div>

              <div class="flex min-w-0 flex-col gap-2">
                <Select
                  label="모둠 *"
                  required
                  placeholder={
                    !division() ? "지부 먼저" : branch() ? "선택" : "지회 먼저"
                  }
                  options={groupOptions()}
                  value={group()}
                  disabled={!division() || !branch()}
                  invalid={!!groupError()}
                  onChange={changeGroup}
                />
                <Show when={groupError()}>
                  <p class="m-0 text-fine leading-normal text-danger" role="alert">
                    {groupError()}
                  </p>
                </Show>
              </div>
            </>
          }
        >
          <div class="flex min-w-0 flex-col gap-2">
            <Input
              label="지회 *"
              required
              placeholder="예: 서울"
              maxlength={AFFILIATION_PART_MAX}
              invalid={!!branchError()}
              value={customBranch()}
              onInput={changeCustomBranch}
            />
            <Show when={branchError()}>
              <p class="m-0 text-fine leading-normal text-danger" role="alert">
                {branchError()}
              </p>
            </Show>
          </div>

          <div class="flex min-w-0 flex-col gap-2">
            <Input
              label="모둠 *"
              required
              placeholder="예: 동부"
              maxlength={AFFILIATION_PART_MAX}
              invalid={!!groupError()}
              value={customGroup()}
              onInput={changeCustomGroup}
            />
            <Show when={groupError()}>
              <p class="m-0 text-fine leading-normal text-danger" role="alert">
                {groupError()}
              </p>
            </Show>
          </div>
        </Show>
      </div>

      <p class="m-0 text-fine text-danger empty:hidden" aria-live="polite">
        {message()}
      </p>

      <div
        class={`mt-2 flex justify-end gap-2 ${
          props.cancellable ? "" : "[&>span]:flex-1"
        }`}
      >
        <Show when={props.cancellable}>
          <Button
            variant="secondary"
            type="button"
            disabled={busy()}
            onClick={() => props.onCancel?.()}
          >
            취소
          </Button>
        </Show>
        <Button variant="primary" type="submit" loading={busy()}>
          {props.submitLabel ?? "저장"}
        </Button>
      </div>
      <Show when={props.note}>
        <p class="m-0 text-center text-fine leading-normal text-ink-2">
          {props.note}
        </p>
      </Show>
    </form>
  );
}
