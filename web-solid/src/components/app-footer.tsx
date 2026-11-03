export function AppFooter(props: { surface?: boolean }) {
  return (
    <footer class={`app-footer ${props.surface ? "surface" : ""}`}>
      <div class="inner">
        <p>정토회 · 함께 쓰는 물품</p>
        <nav aria-label="정책">
          <a href="/policy/terms">이용약관</a>
          <a href="/policy/privacy">개인정보처리방침</a>
        </nav>
      </div>
    </footer>
  );
}
