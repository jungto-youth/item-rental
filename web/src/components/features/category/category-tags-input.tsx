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
    if (event.key === "Enter" || event.key === ",") {
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

  return (
    <div class="category-tags-input">
      <For each={props.value}>
        {(name, index) => (
          <span class="tag">
            #{name}
            <button
              type="button"
              aria-label={`${name} 태그 제거`}
              onClick={() => removeTag(index())}
            >
              ✕
            </button>
          </span>
        )}
      </For>
      <input
        list={listId}
        aria-label={placeholder()}
        placeholder={props.value.length === 0 ? placeholder() : "추가…"}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
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
