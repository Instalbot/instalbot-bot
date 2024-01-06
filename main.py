from playwright.sync_api import sync_playwright
import time, psycopg2

connection = psycopg2.connect(
    host="127.0.0.1",
    port="5432",
    database="sraka",
    user="host",
    password="1234"
)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto("https://instaling.pl/teacher.php?page=login")

    page.locator('//*[@id="log_email"]').fill("")
    page.locator('//*[@id="log_password"]').fill("")
    page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click()

    page.locator('//*[@id="student_panel"]/p[1]/a').click()
    page.wait_for_load_state("networkidle")
    try:
        page.locator('//*[@id="start_session_button"]').click(force=True)
    except:
        page.locator('//*[@id="continue_session_button"]').click(force=True)

    while True:
        page.wait_for_load_state("networkidle")
        try:
            page.locator('//*[@id="know_new"]').click(force=True)
        except:
            try:
                page.wait_for_load_state("networkidle")
                word = page.locator('//*[@id="question"]/div[2]/div[2]').text_content()
                print(word)
            except:
                print("No more words")
                break
            page.locator('//*[@id="answer"]').fill()
            page.locator('//*[@id="check"]').click()

            break
            
    page.screenshot(path="example.png")
    time.sleep(2)
    browser.close()