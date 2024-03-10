#!/bin/bash

#sleep 3
#if [ -e "../package.json" ] && [ -e "../package.json" ]; then
#  cd ..
#  echo "1. [PASSED] Switching to project root..."
#else
#  echo "1. [PASSED] running in project root,package.json exists."
#fi

# Now we use this to ensure it sits in the right directory -- project root
cd "$(dirname "$0")/.."

ins_ok=0
if [ -e "data/install.ok" ]; then
  ins_ok=1
fi

if [ -e "package.json" ]; then
  cd ..
  [ $ins_ok -eq 1 ] || echo "1. [PASSED] We are currently in project root."
else
  echo "1. [FAILED] cannot find package.json. Please run this script in the project root."
  echo "      For this reason, the program will stop after 5 seconds."
  sleep 5
  exit
fi

if [ ! -e "data/proxy.js" ] && [ ! -e "proxy.js" ]; then
    echo "2. [ WARN ] proxy setting not found."
    echo "      Copying proxy.js-template to data/ dir."
    echo "      Please change that file to your current proxy setting."
    cp "config/proxy.js-template" "data/proxy.js"
else
  [ $ins_ok -eq 1 ] || echo "2. [PASSED] proxy setting is in place."
fi

if [ ! -e "data/user.conf.js" ]; then
  # no effective user config file

  # We added below code to avoid user written their config with heart but forgot to rename it
  if [ ! -e "data/CHANGE_ME)user.conf.js" ]; then
      # no template user config file
      echo "3. [ WARN ] user config file not exist."
      echo "      Copying user.conf.js template to data/ dir."
      cp "config/minimum_user.conf.js" "data/CHANGE_ME)user.conf.js"
      echo "      Please set necessary values in that file, and rename it to 'user.conf.js'."
      echo "      For this reason, the program will stop after 5 seconds."
      sleep 5
      exit
  else
      echo "3. [ WARN ] user config file not complete."
      echo "      Did you forget to rename it to 'user.conf.js'?"
      echo "      For this reason, the program will stop after 5 seconds."
      sleep 5
      exit
  fi
else
  [ $ins_ok -eq 1 ] || echo "3. [PASSED] user config is in place."
fi

#if [ -e "data/CHANGE_ME)user.conf.js" ]; then
#    echo "'data/CHANGE_ME)user.conf.js' exists. "
#    echo "Please stop the container, set proper value in that file, and rename to 'user.conf.js'."
#    echo "The program will stop after 5 seconds."
#    sleep 5
#    exit
#fi

# Check for 'data/sticker_l4.json' and create an empty one if it doesn't exist
if [ ! -e "data/sticker_l4.json" ]; then
    echo "4. [ INFO ] current sticker storage is not exist."
    echo "      Creating an empty 'data/sticker_l4.json'."
    echo "{}" > "data/sticker_l4.json"
else
    [ $ins_ok -eq 1 ] || echo "4. [PASSED] sticker storage is in place." 
fi

# Check if 'downloaded/' exists, if not copy everything from 'static/template___downloaded/'
#if [ ! -d "downloaded/" ]; then
#    echo "'downloaded/' directory does not exist. Copying from 'static/template___downloaded/'."
#    cp -r "static/template___downloaded/" "downloaded/"
#fi

if [ ! -e "data/install.ok" ]; then
  # first complete install
  echo -e "\n\n\n"
  echo "You are all set! The script will mark you as completed installation."
  echo "If you want to re-run install procedure, please remove 'data/install.ok' file."
  echo "We are ready to run in 3 seconds..."
  sleep 3
  echo "{}" > "data/install.ok"
fi

#===============================================

#export WECHATY_LOG=silly

npm run p
