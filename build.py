"""src/ 안의 조각들을 합쳐 index.html 한 파일로 만든다.  사용법: python3 build.py"""
import pathlib
src = pathlib.Path(__file__).parent / 'src'
read = lambda n: (src / n).read_text(encoding='utf8')
page = read('page.html')
for mark, name in [('/*__PEOPLE__*/', 'people_core.js'), ('/*__ENV__*/', 'env.js'), ('/*__NPC__*/', 'npc.js'), ('/*__NET__*/', 'net.js'), ('/*__GAME__*/', 'game.js')]:
    if mark in page:
        page = page.replace(mark, read(name))
(pathlib.Path(__file__).parent / 'index.html').write_text(page, encoding='utf8')
print('index.html', len(page))
