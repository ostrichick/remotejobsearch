export default function Login({ error }: { error: string }) {
  return (
    <main className="login">
      <p className="brand">RoleScout</p>
      <h1>내 경력에서 시작하는 공고 탐색</h1>
      <p>
        이력서를 올리고 실제 채용 조건을 비교하세요. 각 계정의 문서와 저장한 공고는 본인에게만
        보입니다.
      </p>
      <a className="primary" href="/signin-with-chatgpt?return_to=/" target="_top">
        ChatGPT 계정으로 로그인
      </a>
      {error && <p role="alert">{error}</p>}
      <p className="muted">현재 링크를 받은 사람이 로그인할 수 있는 테스트 서비스입니다.</p>
    </main>
  );
}
