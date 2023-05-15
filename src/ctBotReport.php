<?php
$c = [
    "lastOperation" => 0,
    "_last" => [],
    "runningTime" => 0,
    "logText" => "",
    "generationDate"=>""
];
if (isset($_REQUEST["s"])) {
    if ($_REQUEST["s"] === "create") try {
        $recvJson = file_get_contents("php://input");
        $recvArr = json_decode($recvJson, true);
        if (!$recvArr["status"]) throw new Exception("Invalid incoming JSON");
        $fName = date("Ymd-His") . "." . rand(100, 700) . ".json";
        $recvArr["generationDate"]=date("Ymd-His");
        file_put_contents($fName, json_encode($recvArr,JSON_PRETTY_PRINT));
//        echo json_encode([
//            "success" => "1",
//            "filename" => $fName
//        ]);
        echo $fName;
        die();
    } catch (Exception $e) {
        header("Bad Request", true, 400);
        print_r($e);
        die();
    }
    // no valid .php?s=_____
    header("Bad Request", true, 400);
    die();
} else if (isset($_REQUEST["n"])) {
    // read former saved JSON then output it.
    try {
        $readJson = file_get_contents($_REQUEST["n"]);
        $c = json_decode($readJson);
    } catch (Exception $e) {
        header("Internal Error", true, 500);
        die();
    }
} else {
    // no any valid flag, display default page
//    json_encode()
}
?>
<html lang="en-us">
<head>
    <title>CTBot status page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body>
<ul>
    <li>Generation Date: <input type="text" disabled value="<?= $c["generationDate"] ?>"></li>
    <li>Last Operation:
        Chat: <label>
            <input type="checkbox" disabled <?= ($c["lastOperation"] === 1) ? "checked" : "" ?>/>
        </label> -
        FindMode: <label>
            <input type="checkbox" disabled <?= ($c["lastOperation"] === 2) ? "checked" : "" ?>/>
        </label> -
        <details>
            <summary>lastOperation Detail</summary>
            <pre><?= json_encode($c["_last"], JSON_PRETTY_PRINT) ?></pre>
        </details>
    </li>
    <li>
        Running time in seconds: <input type="text" disabled value="<?= $c["runningTime"] ?>">
    </li>
    <li>
        <details open>
            <summary>Last 2400 chars of log</summary>
            <pre><?= $c["logText"] ?></pre>
        </details>
    </li>
</ul>
</body>
<style>
    pre{

    }
</style>
</html>
