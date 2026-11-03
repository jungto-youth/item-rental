import { goBack, navigate } from "../router";
import { BoxIcon } from "../components/icons";
import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <div class="page-not-found">
      <span class="icon" aria-hidden="true">
        <BoxIcon />
      </span>

      <p class="code">404</p>
      <h1>페이지를 찾을 수 없어요</h1>
      <p class="desc">
        주소가 바뀌었거나 삭제된 페이지예요.
        <br />
        물품 현황으로 돌아가 볼까요?
      </p>

      <div class="actions">
        <Button variant="primary" onClick={() => navigate("/")}>
          물품 현황으로
        </Button>
        <Button variant="secondary" onClick={goBack}>
          이전으로
        </Button>
      </div>
    </div>
  );
}
