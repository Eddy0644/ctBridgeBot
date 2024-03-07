@echo off
cd %~dp0
cd ..

echo This program will probably destroy all your config and data in project directory!
echo Please be sure that you want to run this batch program to initiate some files on Windows.
pause

copy "config\minimum_user.conf.js" "data\CHANGE_ME)user.conf.js"
echo {} > data\sticker_l4.json
xcopy "static\template___downloaded" "downloaded"

echo Completed! Please check if all files in right position.
timeout -t 5