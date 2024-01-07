from playwright.sync_api import sync_playwright
import time, psycopg2, sys

sys.stdout.reconfigure(encoding='utf-8')

connection = psycopg2.connect(
    host="127.0.0.1",
    port="5432",
    database="sraka",
    user="host",
    password="1234"
)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://instaling.pl/teacher.php?page=login")


    page.locator('//*[@id="log_email"]').fill("")
    page.locator('//*[@id="log_password"]').fill("")
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
    cursor = connection.cursor()

    while True:
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        try:
            try:
                page.wait_for_load_state("networkidle")
                word = page.locator('//*[@id="question"]/div[2]/div[2]').text_content()
                print(word)
            except:
                print("No more words")
                break
            page.wait_for_load_state("networkidle")
            cursor.execute(f"SELECT de FROM words WHERE pl = '{word}'")
            result = cursor.fetchone()
            page.locator('//*[@id="answer"]').fill(result[0])
            page.locator('//*[@id="check"]').click()
            page.locator('//*[@id="nextword"]').click()
        except:
            page.locator('//*[@id="know_new"]').click(force=True)


    cursor.close()
    connection.close()

    time.sleep(1)
    page.screenshot(path="example.png")
    time.sleep(5)
    browser.close()