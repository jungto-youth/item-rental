import { unsafeCSS } from "lit";
import text from "./base.css?inline";

// shadow root 공통 바탕 — 모든 컴포넌트의 static styles 첫 번째.
//
//   static styles = [base, sheet(styles)]
//
// 이걸 깔면 컴포넌트 CSS는 "자기 레이아웃"만 쓰면 되고,
// 서체·행간·box-sizing을 컴포넌트마다 되풀이하지 않아도 된다.
export const base = unsafeCSS(text);
