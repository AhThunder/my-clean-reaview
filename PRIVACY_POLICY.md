# Privacy Policy for MyCleanReview (개인정보 처리방침)

**최종 수정일 (Last Updated)**: 2026년 10월 19일 (October 19, 2026)

MyCleanReview(이하 "확장 프로그램")는 사용자의 개인정보를 매우 소중하게 생각하며, 사용자의 프라이버시를 보호하기 위해 최선을 다하고 있습니다. 본 개인정보 처리방침은 확장 프로그램이 사용자의 데이터를 어떻게 처리하고 보호하는지 설명합니다.

---

## 1. 수집하는 정보 (Information Collection)

MyCleanReview는 **어떠한 개인 식별 정보(PII)나 민감한 개인정보도 수집, 저장, 전송하지 않습니다.**

- **수집하지 않는 항목**: 이름, 이메일, 전화번호, 주소, 주민등록번호, 결제 정보, 쿠팡 로그인 계정 정보, 웹 브라우징 기록, 위치 정보 등.
- **일시적으로 처리되는 데이터**:
  - 사용자가 현재 보고 있는 쿠팡 상품 상세 페이지의 **공개된 상품 리뷰 본문 텍스트(Public Review Content)** 및 평점 정보.
  - 이 데이터는 오직 사용자의 요청에 따른 "AI 리뷰 요약"을 생성하기 위해서만 일시적으로 읽히며, 개발자의 외부 서버에 저장되거나 보관되지 않습니다.

---

## 2. 권한 사용 목적 (Permission Justifications)

확장 프로그램은 핵심 기능 수행을 위해 필요한 최소한의 권한만을 사용합니다.

| 권한 (Permission) | 사용 목적 (Purpose) |
| :--- | :--- |
| **`storage`** | 사용자가 설정한 요약 옵션(분석 개수, 별점 비율, 필터 강도, 선택 모델) 및 마지막 분석 결과 세션을 사용자의 브라우저 로컬에만 안전하게 보관하여 팝업 재실행 시 복원하기 위함. |
| **`activeTab`** | 사용자가 현재 머물고 있는 활성 탭이 쿠팡 상품 상세 페이지인지 감지하고, 해당 페이지의 상품 ID(`productId`)를 식별하여 리뷰 요약 기능을 동작시키기 위함. |
| **`*://*.coupang.com/*`** | 쿠팡 상품 상세 페이지에서 리뷰 데이터 API(`next-api/review`)를 호출하여 공개 리뷰 텍스트를 수집하고, 페이지 내에 플로팅 퀵 버튼 UI를 제공하기 위함. |
| **`https://generativelanguage.googleapis.com/*`** | 정제된 공개 리뷰 텍스트를 Google Gemini LLM API로 안전하게 전송하여 AI 요약 결과를 수신하기 위함. |

---

## 3. 원격 코드 사용 여부 (Use of Remote Code)

MyCleanReview는 **어떠한 원격 코드(Remote Code Execution)도 실행하거나 다운로드하지 않습니다.**  
확장 프로그램을 구동하는 모든 스크립트(`popup.js`, `background.js`, `content.js`, `gemini.js` 등)는 Chrome 확장 프로그램 패키지 내부에 100% 로컬 번들링되어 있습니다. 외부와의 통신은 순수한 JSON 데이터 전송(REST API)에 한정됩니다.

---

## 4. 제3자 데이터 전송 (Third-Party Disclosure)

확장 프로그램은 사용자가 [AI 리뷰 요약 시작] 버튼을 누른 경우에 한하여, 요약에 필요한 **공개 리뷰 텍스트 본문만을 Google Gemini API로 전송**합니다.
- **전송 대상**: Google Cloud (Google Gemini API)
- **전송 목적**: 실구매자 리뷰 텍스트의 AI 요약 및 핵심 단점/장점 분석 생성
- **보안**: 모든 통신은 최신 암호화 프로토콜(HTTPS / TLS)을 통해 안전하게 암호화되어 전송됩니다.
- 본 확장 프로그램은 사용자의 어떠한 데이터도 제3자 광고 네트워크, 데이터 브로커 등에 판매하거나 마케팅 목적으로 활용하지 않습니다.

---

## 5. 데이터 보관 및 보안 (Data Retention & Security)

- 모든 사용자 설정 및 마지막 요약 세션은 오직 **사용자의 로컬 기기(Chrome 브라우저 로컬 스토리지)**에만 저장됩니다.
- 외부 데이터베이스나 개발자 소유의 백엔드 서버를 전혀 운영하지 않으므로, 서버 해킹으로 인한 데이터 유출 위험이 없습니다.
- 사용자는 확장 프로그램을 삭제(제거)하거나 Chrome 캐시를 삭제함으로써 기기 내에 저장된 모든 로컬 데이터를 즉시 완전히 파기할 수 있습니다.

---

## 6. 개인정보 보호 문의 (Contact Us)

본 개인정보 처리방침 또는 확장 프로그램의 데이터 처리에 관하여 질문, 피드백, 요청 사항이 있으신 경우 아래 GitHub 저장소를 통해 문의해 주시기 바랍니다.

- **GitHub Repository**: [https://github.com/AhThunder/my-clean-reaview](https://github.com/AhThunder/my-clean-reaview)
- **Issues / 문의**: [https://github.com/AhThunder/my-clean-reaview/issues](https://github.com/AhThunder/my-clean-reaview/issues)
