<?php
$c = [
    "lastOperation" => 0,
    "_last" => [],
    "runningTime" => 0,
    "logText" => "",
    "poolToDelete" => [],
    "generationDate" => ""
];
// echo "11111";
if (isset($_REQUEST["s"])) {
    if ($_REQUEST["s"] === "create") try {
        $recvJson = file_get_contents("php://input");
        $recvArr = json_decode($recvJson, true);
        //echo $recvJson;
        if (!$recvArr["status"]) throw new Exception("Invalid incoming JSON");
        $fName = date("Ymd-His") . "." . rand(100, 700) . ".json";
        $recvArr["generationDate"] = date("Ymd-His");
        file_put_contents($fName, json_encode($recvArr, JSON_PRETTY_PRINT));
//        echo json_encode([
//            "success" => "1",
//            "filename" => $fName
//        ]);
        echo $fName;
        die();
    } catch (Exception $e) {
        header("HTTP/1.1 400 Bad Request");
        //header("400 Bad Request");
        print_r($e);
        die();
    }
    // no valid .php?s=_____
    header("HTTP/1.1 400 Bad Request");
    die();
} else if (isset($_REQUEST["n"])) {
    // read former saved JSON then output it.
    try {
        $readJson = file_get_contents($_REQUEST["n"]);
        $c = json_decode($readJson, true);
    } catch (Exception $e) {
        header("500 Internal Error");
        die();
    }
} else {
    // no any valid flag, display default page
    header("HTTP/1.1 400 Bad Request");
    die("STOPSTOPSTOP.STOPSTOPSTOP.STOPSTOPSTOP.STOPSTOPSTOP.STOPSTOPSTOP");
}
?>
<html lang="en-us">
<head>
    <title>CTBot status page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body>
<ul>
    <li>Generation Date: <label>
            <input type="text" disabled value="<?= $c["generationDate"] ?>">
        </label></li>
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
        Running time in seconds: <label>
            <input type="text" disabled value="<?= $c["runningTime"] ?>">
        </label>
    </li>
    <li>
        <details>
            <summary>poolToDelete Detail</summary>
            <pre><?= json_encode($c["poolToDelete"], JSON_PRETTY_PRINT) ?></pre>
        </details>
    </li>
    <li>
        <details open>
            <summary>Last 5000 chars of log</summary>
            <pre><?= str_replace(["<", ">"], ["&lt;", "&gt;"], $c["logText"]) ?></pre>
        </details>
    </li>
</ul>
</body>
<style>
    pre {
        margin: 5px;
        padding: 5px;
    }

    details {
        background-color: #ede8e8;
        border: dashed 3px #9f9fea;
    }

    summary {
        background-color: white;
        border-bottom: dashed 1px black;
        padding: 5px;
    }
</style>
</html>
