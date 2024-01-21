import sys
import time
import random
import os

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Playwright, TimeoutError as PlaywrightTimeoutError
from sqlalchemy import select, text
from sqlalchemy.orm import Session

load_dotenv()

from db import db, models

username = ""
password = ""
userid = 1

def xor_encryption(text, key):
    encrypted_text = ""

    for i in range(len(text)):
        encrypted_text += chr(ord(text[i]) ^ ord(key[i % len(key)]))

    return encrypted_text

def main(userid):
    try:

        with db.Session() as session:
            try:
                flag = session.query(models.Flag).filter_by(userid=userid).first()
                global username, password
                username = flag.instaling_user
                password = xor_encryption(flag.instaling_pass, os.getenv('INSTALING_KEY'))
                error_level = flag.error_level
            except Exception as e:
                print(f"Exception thrown while getting , {e}")
                session.rollback()
                return

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=False)
            page = browser.new_page()
            page.goto("https://instaling.pl/teacher.php?page=login")

            page.locator('//*[@id="log_email"]').fill(username)
            page.locator('//*[@id="log_password"]').fill(password)
            page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click()
            if page.url == "https://instaling.pl/teacher.php?page=login":
                return browser.close()

            page.locator('//*[@id="student_panel"]/p[1]/a').click()
            page.wait_for_load_state("networkidle")
            try:
                page.locator('//*[@id="start_session_button"]').click(force=True)
            except:
                page.locator('//*[@id="continue_session_button"]').click(force=True)

            page.set_default_navigation_timeout(0)

            with db.Session() as session:
                try:
                    result = session.query(models.Word).filter_by(userid=userid).first()
                    if result is None:
                        print("No words")
                        return
                    else:
                        data = result.list
                        truthtable = {}
                        for word in data:
                            truthtable[word["key"]] = word["value"]

                except Exception as e:
                    print(f"Exception thrown while getting words, {e}")
                    session.rollback()
                    return

            while True:
                page.wait_for_load_state("networkidle")
                time.sleep(1)
                try:
                    try:
                        page.wait_for_load_state("networkidle")
                        page.locator('//*[@id="know_new"]').click(force=True)
                        page.wait_for_load_state("networkidle")
                        page.locator('//*[@id="skip"]').click(force=True)
                        continue
                    except:
                        pass

                    try:
                        page.wait_for_load_state("networkidle")
                        word = page.locator('//*[@id="question"]/div[2]/div[2]').inner_text(timeout=2000)
                    except PlaywrightTimeoutError:
                        break
                    except:
                        print("No word")
                        break
                    page.wait_for_load_state("networkidle")

                    try:
                        result = truthtable[word]
                    except KeyError:
                        print(word)
                        print("No word in database")
                        break

                    try:
                        if random.randint(0, 100) < error_level:
                            pass #zostawia puste pole
                        else:
                            page.locator('//*[@id="answer"]').fill(result, timeout=1000)
                    except PlaywrightTimeoutError:
                        break

                    page.locator('//*[@id="check"]').click()
                    page.locator('//*[@id="nextword"]').click()
                except:
                    page.locator('//*[@id="know_new"]').click(force=True)

            browser.close()
    except Exception as e:
        print(f"Ups somthing went wrong {e}")
        return

main(userid)