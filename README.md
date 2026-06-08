# ssadagu-air-site (공개 배포 repo)

싸다구항공 고객용 PWA입니다. **고객에게 공개 가능한 것만** 둡니다.
- `index.html` — PWA 화면 (딜 검문소 카드)
- `published.json` — 검수완료 딜 (비공개 core repo에서 export)
- `manifest.json`, `sw.js`, `icon.svg` — PWA 셸

운영 엔진·검수 로직·관리자 콘솔·candidates.json은 **비공개 repo(`ssadagu-air`)**에 있습니다.
published.json은 core repo의 `publish.py`(또는 관리자 검수 콘솔)가 생성해 이 repo로 push합니다.

GitHub Pages로 호스팅됩니다.
