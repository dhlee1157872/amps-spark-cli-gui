import AMPS
import random
import uuid
import json
import time

URI = "tcp://localhost:9007/amps/json"
TOPIC = "topic1"
ID_COUNT = 100
IDS = [str(uuid.uuid4()) for _ in range(ID_COUNT)]

client = AMPS.Client('publisher')

client.connect(URI)
client.logon()

while True:
    msg = json.dumps({"id": random.choice(IDS), "price": round(random.uniform(10.00, 300.00), 2), "action": random.choice(['buy', 'sell']), "amount": random.randint(100,5000)})
    client.publish(TOPIC,msg)
    time.sleep(0.2)

