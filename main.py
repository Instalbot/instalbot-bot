from datetime import datetime
from random import randint
from dotenv import load_dotenv
from sqlalchemy import text, update
import pytz
import threading
import time

load_dotenv()

from db import db, models

botQueue = dict([])

def spawn_bot(bot):
    with db.Session() as session:
        try:
            changes = update(models.Flag).where(models.Flag.userid == bot.userid).values(todo=False)
            session.execute(changes)
            session.commit()
        except Exception as e:
            session.rollback()
            return

    print(bot.to_dict())


def refresh_queue():
    with db.Session() as session:
        # Retrieve all flags that are in range of flag's hoursrange
        result = session.query(models.Flag).filter(
            text("numeric_add(EXTRACT(HOUR FROM now()), EXTRACT(MINUTE FROM now()) / 60) <@ hoursrange")
        ).filter_by(todo=True).all()
        
        # Insert flags to botQueue
        keys = botQueue.keys()

        for flag in result:
            # Generate random time for flag and push it to queue
            if str(flag.userid) not in keys:
                now = datetime.now(pytz.timezone('Europe/Warsaw'))
                timestamp = round(now.timestamp()) - now.minute * 60
                czas = randint(timestamp, timestamp + (int(flag.hoursrange.upper) - now.hour) * 3600)
                botQueue[str(flag.userid)] = [flag, czas]
            else:
                pass


def schedule_refresh():
    timer = threading.Timer(1, schedule_refresh)
    timer.start()
    refresh_queue()


def start_waiter():
    while True:
        now = datetime.now(pytz.timezone('Europe/Warsaw'))
        timestamp = round(now.timestamp()) - now.minute * 60
        for bot in botQueue.copy():
            if botQueue[bot][1] > timestamp:
                thread = threading.Thread(target=spawn_bot, args=(botQueue[bot][0],))
                thread.start()
                del botQueue[bot]
            else:
                pass
        time.sleep(1)


if __name__ == "__main__":
    refreshing = threading.Thread(target=schedule_refresh)
    refreshing.start()
    waiter = threading.Thread(target=start_waiter)
    waiter.start()
