from playwright.sync_api import sync_playwright, Playwright, TimeoutError as PlaywrightTimeoutError
import time, psycopg2, sys

sys.stdout.reconfigure(encoding='utf-8')

connection = psycopg2.connect(
    host="",
    port="",
    database="",
    user="",
    password=""
)

userId = 6
instaling_user = ""
instaling_password = ""

cursor = connection.cursor()
cursor.execute("SELECT todo FROM flags WHERE userId = %s", (userId,))
result = cursor.fetchone()
if result is not None and result[0] == "false":
    sys.exit()

def main(playwright: Playwright, userId) -> None:
    browser = playwright.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto("https://instaling.pl/teacher.php?page=login")

    page.locator('//*[@id="log_email"]').fill(instaling_user)
    page.locator('//*[@id="log_password"]').fill(instaling_password)
    page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click()
    if page.url == "https://instaling.pl/teacher.php?page=login":
        print("Wrong password")
        sys.exit()
        browser.close()

    page.locator('//*[@id="student_panel"]/p[1]/a').click()
    page.wait_for_load_state("networkidle")
    try:
        page.locator('//*[@id="start_session_button"]').click(force=True)
    except:
        page.locator('//*[@id="continue_session_button"]').click(force=True)

    page.set_default_navigation_timeout(0)
    truthtable = {}
    cursor.execute("SELECT elems->'key' as key, elems->'value' as value FROM words, json_array_elements(list) AS elems WHERE userid = %s", (userId, ))
    result = cursor.fetchall()

    for row in result:
        truthtable[row[0]] = row[1]

    while True:
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        try:
            try:
                page.wait_for_load_state("networkidle")
                word = page.locator('//*[@id="question"]/div[2]/div[2]').inner_text(timeout=1000)
            except PlaywrightTimeoutError:
                break
            except:
                print("No word")
                break
            page.wait_for_load_state("networkidle")
            try:
                print(f"{word} : {truthtable[word]}")
                result = truthtable[word]
            except KeyError:
                print("No word")
                break
            try:
                page.locator('//*[@id="answer"]').fill(result, timeout=1000)
            except PlaywrightTimeoutError:
                break
            page.locator('//*[@id="check"]').click()
            page.locator('//*[@id="nextword"]').click()
        except:
            page.locator('//*[@id="know_new"]').click(force=True)

    cursor.execute("UPDATE flags SET todo = 'False' WHERE userId = %s", (userId,))
    browser.close()

with sync_playwright() as playwright:
    main(playwright, userId)


cursor.close()
connection.close()
