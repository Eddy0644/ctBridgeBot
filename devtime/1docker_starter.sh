#!/bin/bash

# Set default values
screenName="CT"
dockerName="51"
cmd1="cd /mnt"
cmd2="npm start"
targetShell="bash"

# Check if no command-line argument is provided
if [[ $# -eq 0 ]]; then
  echo 'No parameter!'
  echo '$1 for ct, mr, and tq.'
  echo '$2 for EMPTY or r.'
  exit
fi

# Check if 1 command-line argument is provided
if [[ $# -eq 1 ]]; then
  if [[ "$1" == "tq" ]]; then
    screenName="tq"
    dockerName="tq2"
    cmd1="cd /tq"
    cmd2="node src/i.js"
    targetShell="sh"
  elif [[ "$1" == "mr" ]]; then
    screenName="mr"
    dockerName="mr1"
    cmd1="cd /mnt"
    cmd2="./mcl"
    targetShell="bash"
  elif [[ "$1" == "ct" ]]; then
    screenName="ct"
    dockerName="ct3"
    cmd1="cd /bot"
    cmd2="npm run h0"
    targetShell="bash"
  fi
fi

# Check if 2 command-line argument is provided
if [[ $# -eq 2 ]]; then
  if [[ "$2" == "r" ]]; then
    screen -x "$1"
    exit
  fi
fi

docker start "$dockerName"
screen -dmS "$screenName" docker exec -it "$dockerName" "$targetShell"
sleep 2
# Execute the commands inside the screen session
screen -S "$screenName" -X stuff "$cmd1\n"
sleep 1
screen -S "$screenName" -X stuff "$cmd2\n"
