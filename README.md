# chinsogol score site

`score.txt`를 기반으로 대회별/개인별 스코어를 조회하는 정적 웹페이지입니다.

## 로컬 확인

`site/` 폴더를 정적 서버로 열면 됩니다.

예시:

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080/site/` 접속 후 확인합니다.

참고: 로컬에서는 `site/app.js`가 `score.txt`와 `../score.txt`를 순차 시도하도록 되어 있습니다.

## GitHub Pages 배포

1. 저장소에 `.github/workflows/pages.yml`이 포함되어 있어야 합니다.
2. GitHub 저장소 설정에서 `Settings -> Pages -> Build and deployment -> Source`를 `GitHub Actions`로 선택합니다.
3. `main` 또는 `master` 브랜치에 `score.txt` 또는 `site/**` 변경사항을 push하면 자동 배포됩니다.

배포 워크플로우는 루트의 `score.txt`를 `site/score.txt`로 복사한 뒤 Pages artifact로 업로드합니다.
