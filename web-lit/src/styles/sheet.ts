import { unsafeCSS, type CSSResult } from "lit";

// .css 파일의 텍스트를 Lit 스타일로 바꾼다.
//
//   import styles from "./chip.css?inline";
//   static styles = [base, sheet(styles)]
//
// CSS를 문자열 템플릿이 아니라 실제 .css 파일에 두기 위한 한 줄짜리 어댑터다.
// 에디터의 CSS 지원(하이라이트·자동완성·포매터)을 그대로 받는다.
export const sheet = (text: string): CSSResult => unsafeCSS(text);
