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

    page.locator('//*[@id="student_panel"]/p[5]/a').click()
    page.locator('//*[@id="account_page"]/div/a[1]/h4').click()
    page.locator('//*[@id="show_words"]').click()
    time.sleep(1)

    page.set_default_navigation_timeout(0)
    page.wait_for_load_state("networkidle")
    cursor = connection.cursor()
    #cursor.execute("DROP TABLE words")
    cursor.execute("CREATE TABLE IF NOT EXISTS words (pl TEXT NOT NULL, de TEXT NOT NULL)")
    tr = 1
    while True:
        word_pl = page.locator(f'//*[@id="assigned_words"]/tr[{tr}]/td[1]').inner_text(timeout=0)
        word_de = page.locator(f'//*[@id="assigned_words"]/tr[{tr}]/td[2]').inner_text(timeout=0)
        if word_pl == [] or word_de == []:
            break
        print(f"{word_pl} : {word_de}")
        cursor.execute("INSERT INTO words (pl, de) VALUES (%s, %s);", (word_de, word_pl))
        tr += 1

    cursor.close()
    connection.commit()
    connection.close()
    browser.close()