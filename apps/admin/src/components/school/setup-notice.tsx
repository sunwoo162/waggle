export function SchoolSetupNotice() {
  return (
    <section className="school-page">
      <header className="school-heading">
        <div>
          <h1>학교 설정 저장소 준비</h1>
          <p>암호화 키와 저장소 스키마를 확인해주세요.</p>
        </div>
      </header>
      <div className="school-editor">
        <h2>운영자 설정</h2>
        <ol>
          <li>
            <code>npm run settings:setup</code>으로 독립 암호화 키를 준비합니다.
          </li>
          <li>
            <code>npm run settings:migrate</code>로 스키마를 준비합니다.
          </li>
          <li>서버를 다시 시작합니다.</li>
        </ol>
        <p>
          기존 키가 있는 저장소라면 원래 키를 복원해주세요. 새 키로 기존 데이터를 덮어쓰지 마세요.
        </p>
      </div>
    </section>
  );
}
