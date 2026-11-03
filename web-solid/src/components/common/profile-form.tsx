import { Show, createSignal, untrack } from "solid-js";
import { api } from "../../api/client";
import { session } from "../../context/session";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CheckIcon } from "../icons";

type Props = {
  initialName?: string;
  initialPhone?: string;
  title?: string;
  hint?: string;
  submitLabel?: string;
  cancellable?: boolean;
  email?: string;
  accountLabel?: string;
  accountVerified?: boolean;
  avatar?: boolean;
  note?: string;
  onSaved?: () => void;
  onCancel?: () => void;
};

// 이름·연락처 폼 — 온보딩(/signup/profile)과 내 정보 수정(mypage) 공용.
export function ProfileForm(props: Props) {
  const [name, setName] = createSignal(untrack(() => props.initialName ?? ""));
  const [phone, setPhone] = createSignal(untrack(() => props.initialPhone ?? ""));
  const [nameError, setNameError] = createSignal("");
  const [phoneError, setPhoneError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const initial = () => (name() || props.email || "").trim().charAt(0).toUpperCase();
  const hint = () => props.hint ?? "대여 연락 목적으로만 사용돼요";

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;
    const nameText = name().trim();
    const phoneText = phone().trim();
    setNameError(nameText ? "" : "이름을 입력해 주세요");
    setPhoneError(phoneText ? "" : "연락처를 입력해 주세요");
    if (!nameText || !phoneText) return;

    setBusy(true);
    setMessage("");
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ name: nameText, phone: phoneText }),
      });
      await session.refresh();
      props.onSaved?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const heading = () => (
    <Show when={props.title}>
      <div class="head">
        <Show when={props.avatar}>
          <span class="avatar" aria-hidden="true">
            {initial()}
          </span>
        </Show>
        <div>
          <h2>{props.title}</h2>
          <Show when={hint()}>
            <p class="hint">{hint()}</p>
          </Show>
        </div>
      </div>
    </Show>
  );

  return (
    <form class="profile-form" onSubmit={submit}>
      {heading()}
      <Show when={props.email}>
        <div class="account">
          <Show when={props.accountVerified}>
            <CheckIcon />
          </Show>
          <span>{props.accountLabel ?? "이메일"}</span>
          <span title={props.email}>{props.email}</span>
        </div>
      </Show>

      <div class="field">
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
          <p class="field-error" role="alert">
            {nameError()}
          </p>
        </Show>
      </div>

      <div class="field">
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
          <p class="field-error" role="alert">
            {phoneError()}
          </p>
        </Show>
      </div>

      <p class="msg" aria-live="polite">
        {message()}
      </p>

      <div class={`actions ${props.cancellable ? "" : "single"}`}>
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
        <p class="note">{props.note}</p>
      </Show>
    </form>
  );
}
