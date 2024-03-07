#!/bin/bash
sleep 3
cd /bot


if [ ! -e "data/user.conf.js" ]; then
    echo "Copying user.conf.js template to data/ dir."
    cp "config/minimum_user.conf.js" "data/CHANGE_ME)user.conf.js"
fi

if [ -e "data/CHANGE_ME)user.conf.js" ]; then
    echo "'data/CHANGE_ME)user.conf.js' exists. "
    echo "Please stop the container, set proper value in that file, and rename to 'user.conf.js'."
    echo "The program will stop after 5 seconds."
    sleep 5
    exit
fi

# Check for 'data/sticker_l4.json' and create an empty one if it doesn't exist
if [ ! -e "data/sticker_l4.json" ]; then
    echo "Creating an empty 'data/sticker_l4.json'."
    echo "{}" > "data/sticker_l4.json"
fi

# Check if 'downloaded/' exists, if not copy everything from 'static/template___downloaded/'
if [ ! -d "downloaded/" ]; then
    echo "'downloaded/' directory does not exist. Copying from 'static/template___downloaded/'."
    cp -r "static/template___downloaded/" "downloaded/"
fi


#export WECHATY_LOG=silly
npm run p
