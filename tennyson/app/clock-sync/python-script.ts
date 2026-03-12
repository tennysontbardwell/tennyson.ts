export const PYTHON_SCRIPT = `
#!/usr/bin/env python3
import json
import socket
import uuid
import sys
import time
import random

CONFIG_PATH = '/tmp/mydata/config.json'
PORT = 8000

with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)
my_name = config['self']['name']
name_to_ip = { n['name']: n['ip'] for n in config['nodes'] }

def send_udp_packet(host, message):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sent = sock.sendto(message.encode(), (host, PORT))
        print(f"Sent {sent} bytes to {host}: {message}")
    finally:
        sock.close()

ping_count = 0
def send_ping(host, name):
    global ping_count
    send_udp_packet(host, f'ping {ping_count} {my_name} {name}')
    ping_count += 1

def receive_udp_packets():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))

    while True:
        data, address = sock.recvfrom(4096)
        d = data.decode()
        if not d.startswith('ping '): continue
        cmd, id, host1, host2 = d.split(' ')
        if cmd == 'ping':
            replyTo = name_to_ip[host1]
            send_udp_packet(replyTo, f'resp {id} {host1} {host2}')

def ping_bot():
    others = [node for node in config['nodes'] if node['name'] != my_name]
    for _ in range(config['iterations']):
        for node in others:
            send_ping(node['ip'], node['name']);
            time.sleep(config['jitterDelay'])
            send_ping(node['ip'], node['name']);
            time.sleep(config['delay'] - config['jitterDelay'] * 1)

if __name__ == "__main__":
    if sys.argv[1] == "server":
        receive_udp_packets()
    elif sys.argv[1] == 'client':
        ping_bot()
`;
