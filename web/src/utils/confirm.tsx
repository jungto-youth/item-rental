import { Show, createSignal } from "solid-js";
import { Modal } from "../components/ui/modal";
import { Button } from "../components/ui/button";

type Options = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Request = Options & { message: string; resolve: (value: boolean) => void };

const [request, setRequest] = createSignal<Request | null>(null);
let active: Request | null = null;

export function confirmDialog(message: string, opts: Options = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const req: Request = { message, ...opts, resolve };
    active = req;
    setRequest(req);
  });
}

function done(value: boolean) {
  const req = active;
  active = null;
  setRequest(null);
  req?.resolve(value);
}

export function ConfirmHost() {
  return (
    <Show when={request()}>
      {(req) => (
        <Modal
          open
          title={req().title ?? "확인"}
          maxWidth="400px"
          onClose={() => done(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => done(false)}>
                {req().cancelLabel ?? "닫기"}
              </Button>
              <Button
                variant={req().danger ? "danger-solid" : "primary"}
                onClick={() => done(true)}
              >
                {req().confirmLabel ?? "확인"}
              </Button>
            </>
          }
        >
          <p class="m-0 whitespace-pre-line">{req().description ?? req().message}</p>
        </Modal>
      )}
    </Show>
  );
}
