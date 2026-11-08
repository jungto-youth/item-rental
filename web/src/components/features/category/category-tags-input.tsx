import { For, createUniqueId, createSignal } from "solid-js";

export function CategoryTagsInput(props: {
  value: string[];
  options: string[];
  placeholder?: string;
  onChange: (value: string[]) => void;
}) {
  const listId = createUniqueId();
  const [draft, setDraft] = createSignal("");
  const placeholder = () => props.placeholder ?? "태그 추가";
  // 한글 IME 로 "불교대" 를 치는 중 마지막 "대" 는 아직 조합 중이라
  // 조합이 끝나기 전에 확정(commit)하면 입력값을 비우는 순간 조합 중이던
  // 글자가 다시 input 에 남아 별도 태그가 된다. 조합이 끝난 뒤 확정한다.
  let composing = false;
  let commitAfterComposition = false;

  const hasName = (name: string) => {
    const lower = name.toLowerCase();
    return props.value.some((value) => value.toLowerCase() === lower);
  };

  const commit = () => {
    const text = draft().trim();
    if (!text) return;
    setDraft("");
    if (hasName(text)) return;
    props.onChange([...props.value, text]);
  };

  const removeTag = (index: number) => {
    const next = [...props.value];
    next.splice(index, 1);
    props.onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // keyCode 229 는 구형 브라우저에서 조합 중 keydown 을 알리는 값이다.
    const inComposition =
      composing || event.isComposing || event.keyCode === 229;
    if (event.key === "Enter" || event.key === ",") {
      if (inComposition) {
        // 조합 중 Enter 는 IME 의 조합 확정 키다. preventDefault 로 막거나
        // 지금 커밋하면 마지막 글자가 떨어져 나간다. 조합이 끝난 뒤 커밋한다.
        if (event.key === "Enter") commitAfterComposition = true;
        return;
      }
      event.preventDefault();
      commit();
    } else if (
      event.key === "Backspace" &&
      draft() === "" &&
      props.value.length > 0
    ) {
      removeTag(props.value.length - 1);
    }
  };

  const onCompositionStart = () => {
    composing = true;
  };

  const onCompositionEnd = (event: CompositionEvent) => {
    composing = false;
    const input = event.currentTarget as HTMLInputElement | null;
    if (input) setDraft(input.value);
    if (!commitAfterComposition) return;
    commitAfterComposition = false;
    // 조합 확정 직후 브라우저가 input 이벤트로 값을 다시 채우므로,
    // 그 처리가 끝난 다음에 확정한다.
    setTimeout(commit, 0);
  };

  return (
    <div class="category-tags-input box-border flex min-h-[38px] flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-2 focus-within:border-primary">
      <For each={props.value}>
        {(name, index) => (
          <span class="tag inline-flex h-7 items-center gap-2 rounded-pill bg-primary-soft px-2 text-fine text-primary-strong">
            #{name}
            <button
              type="button"
              class="cursor-pointer border-0 bg-transparent p-2 text-fine text-ink-2 hover:text-danger"
              aria-label={`${name} 태그 제거`}
              onClick={() => removeTag(index())}
            >
              ✕
            </button>
          </span>
        )}
      </For>
      <input
        class="min-w-[90px] flex-1 border-0 bg-transparent font-sans text-body text-ink-1 outline-none placeholder:text-ink-2"
        list={listId}
        aria-label={placeholder()}
        placeholder={props.value.length === 0 ? placeholder() : "추가…"}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onBlur={commit}
      />
      <datalist id={listId}>
        <For each={props.options.filter((name) => !props.value.includes(name))}>
          {(name) => <option value={name} />}
        </For>
      </datalist>
    </div>
  );
}
