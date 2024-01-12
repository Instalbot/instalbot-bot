from playwright.sync_api import sync_playwright, Playwright, TimeoutError as PlaywrightTimeoutError
from dotenv import load_dotenv
from sqlalchemy import select, text
from sqlalchemy.orm import Session
import time, sys

load_dotenv()

from db import db, models

#TODO: odszyfrowanie hasła i pobiernie hasła i użytkownika z bazy

userId = 6
instaling_user = ""
instaling_password = ""

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

    with db.Session() as session:
        result = session.query(models.Word).filter_by(userid=userId).first()
        if result is None:
            print("No words")
            sys.exit()
        else:
            data = result.list
            truthtable = {}
            for word in data:
                truthtable[word["key"]] = word["value"]

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

    browser.close()

with sync_playwright() as playwright:
   main(playwright, userId)