# Subway Survive

한국 지하철에서 AI 승객 사이에 섞인 다른 플레이어를 찾아내는 1인칭 웹 게임.

- 플레이: https://newstar187.github.io/Subway_survive/
- 조작: WASD 이동, Shift 달리기, E 앉기·손잡이·줍기·구매, 클릭 공격·마시기·휴대폰 보기, 1~5·휠 물건 바꾸기, H 휘파람, G 그래픽

## 구조

`index.html` 한 파일로 동작한다. `src/`의 조각을 `python3 build.py`로 합쳐서 만든다.

| 파일 | 내용 |
| --- | --- |
| `src/page.html` | 화면 틀, 입력, 프레임 루프 |
| `src/people_core.js` | 승객 모델과 동작, 손에 드는 물건 |
| `src/env.js` | 역과 열차, 재질, 조명, 후처리 |
| `src/npc.js` | 승객 행동 |
| `src/game.js` | 플레이어, 미션, 무기 |
