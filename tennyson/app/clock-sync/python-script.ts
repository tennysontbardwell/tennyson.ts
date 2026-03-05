export const PYTHON_SCRIPT = `
#!/usr/bin/env python3
import json
import socket
import uuid
import sys
import time
import random

CONFIG_PATH = '/tmp/config.json'
PORT = 80

with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)
my_name = config['self']['name']
my_ip = config['self']['ip']

def send_udp_packet(host, message):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sent = sock.sendto(message.encode(), (host, PORT))
        print(f"Sent {sent} bytes")
    finally:
        sock.close()

ping_count = 0
def send_ping(host):
    global ping_count
    send_udp_packet(host, f'ping {ping_count} {my_ip} {host} null')
    ping_count += 1

ping_pong_count = 0
def send_ping_pong(h1, h2):
    global ping_pong_count
    send_udp_packet(h1, f'ping2 {ping_count} {my_ip} {h1} {h2}')
    ping_pong_count += 1

def receive_udp_packets():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))

    while True:
        data, address = sock.recvfrom(4096)
        cmd, id, host1, host2, host3 = data.decode().split(' ')
        if cmd == 'ping' and host3 == 'null':
            send_udp_packet(host1, f'resp {id} {host1} {host2} {host3}')
        if cmd == 'ping2' and host3 != 'null':
            send_udp_packet(host3, f'pong {id} {host1} {host2} {host3}')
        if cmd == 'pong':
            send_udp_packet(host1, f'resp {id} {host1} {host2} {host3}')
        print(f"Received one complete packet: {data.decode()}, From: {address}")

def ping_bot():
    time.sleep(5)
    others = [node for node in config['nodes'] if node['name'] != my_name]
    for _ in range(config['iterations']):
        for node in others:
            host = node['ip']
            send_ping(host);
            time.sleep(config['jitterDelay'])
            send_ping(host);
            time.sleep(config['jitterDelay'])
            # h1, h2 = random.sample(others, 2)
            # send_ping_pong(h1['ip'], h2['ip']);
            time.sleep(config['delay'] - config['jitterDelay'] * 2)

if __name__ == "__main__":
    if sys.argv[1] == "server":
        receive_udp_packets()
    elif sys.argv[1] == 'client':
        ping_bot()
`;
