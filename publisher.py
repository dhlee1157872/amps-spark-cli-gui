import AMPS
import random
import uuid
import json
import time

URI = "tcp://localhost:9007/amps/json"
URI2 = "tcp://localhost:9107/amps/json"
TOPIC = "topic1"
IDS = [
  'MMM', 'ABBV', 'ALV', 'GOOGL', 'AMZN', 'AMGN', 'ABI', 'APPL', 'BHP', 'BA', 'BP',
  'BATS', 'CVX', 'CSCO', 'C', 'KO', 'DD', 'XOM', 'FB', 'GE', 'GSK', 'HSBA', 'INTC',
  'IBM', 'JNJ', 'JPM', 'MA', 'MCD', 'MRK', 'MSFT', 'NESN', 'NOVN', 'NVDA', 'ORCL',
  'PEP', 'PFE', 'PM', 'PG', 'ROG', 'RY', 'RDSA', 'SMSN', 'SAN', 'SIE', 'TSM', 'TOT',
  'V', 'WMT', 'DIS'
]

client1 = AMPS.Client('publisher1')
client2 = AMPS.Client('publisher2')

client1.connect(URI)
client1.logon()

client2.connect(URI2)
client2.logon()

while True:
    msg = json.dumps({"id": random.choice(IDS), "price": round(random.uniform(10.00, 300.00), 2), "action": random.choice(['buy', 'sell']), "amount": random.randint(100,5000)})
    client1.publish(TOPIC,msg)
    client2.publish(TOPIC,msg)
    time.sleep(0.2)

