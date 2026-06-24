<?php
// 版权所有：1330600100。二次开发与定制合作请联系 QQ。
// AIGOU PbootCMS publish bridge.
// Upload this file to the PbootCMS site root and rename/copy it as aigou-publish.php.
// Replace CHANGE_THIS_TOKEN with the token generated in the AIGOU admin wizard.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$secret = 'CHANGE_THIS_TOKEN';
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = [];
}
$payload = array_merge($_GET, $payload);
$token = $_SERVER['HTTP_X_AIGOU_TOKEN'] ?? ($payload['token'] ?? '');
$action = strtolower(trim((string)($payload['action'] ?? 'publish')));

if (!$token || !hash_equals($secret, (string)$token)) {
    http_response_code(401);
    echo json_encode(['status' => 0, 'success' => false, 'msg' => 'Token ��֤ʧ��', 'message' => 'Token ��֤ʧ��'], JSON_UNESCAPED_UNICODE);
    exit;
}

function aidog_value($payload, $key, $default = '') {
    return array_key_exists($key, $payload) ? $payload[$key] : $default;
}

function aidog_clean($value) {
    return trim((string)$value);
}

function aidog_tree(array $rows, $parent = '0') {
    $knownParents = [];
    foreach ($rows as $row) {
        $knownParents[(string)($row['pcode'] ?? '0')] = true;
    }

    $tree = [];
    foreach ($rows as $row) {
        $rowParent = (string)($row['pcode'] ?? '0');
        if ($rowParent === '') {
            $rowParent = '0';
        }
        if ($rowParent !== (string)$parent) {
            continue;
        }
        $children = aidog_tree($rows, $row['scode'] ?? $row['id']);
        $node = ['id' => (string)($row['scode'] ?? $row['id']), 'name' => $row['name']];
        if ($children) {
            $node['children'] = $children;
        }
        $tree[] = $node;
    }

    if ($parent === '0' && !$tree) {
        $ids = [];
        foreach ($rows as $row) {
            $ids[(string)($row['scode'] ?? $row['id'])] = true;
        }
        foreach ($rows as $row) {
            $rowParent = (string)($row['pcode'] ?? '0');
            if ($rowParent !== '' && isset($ids[$rowParent])) {
                continue;
            }
            $children = aidog_tree($rows, $row['scode'] ?? $row['id']);
            $node = ['id' => (string)($row['scode'] ?? $row['id']), 'name' => $row['name']];
            if ($children) {
                $node['children'] = $children;
            }
            $tree[] = $node;
        }
    }

    return $tree;
}

function aidog_select(array $nodes, $depth = 0) {
    $html = '';
    foreach ($nodes as $node) {
        $indent = str_repeat('&nbsp;&nbsp;&nbsp;&nbsp;', $depth);
        $html .= '<option value="' . htmlspecialchars($node['id'], ENT_QUOTES, 'UTF-8') . '">' . $indent . htmlspecialchars($node['name'], ENT_QUOTES, 'UTF-8') . '</option>';
        if (!empty($node['children'])) {
            $html .= aidog_select($node['children'], $depth + 1);
        }
    }
    return $html;
}

function aidog_flat_categories(array $nodes) {
    $output = [];
    foreach ($nodes as $node) {
        $output[] = ['id' => $node['id'], 'name' => $node['name']];
        if (!empty($node['children'])) {
            $output = array_merge($output, aidog_flat_categories($node['children']));
        }
    }
    return $output;
}

function aidog_download_image($url, $path, $filename) {
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
        return false;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $imageData = curl_exec($ch);
    curl_close($ch);
    if ($imageData !== false) {
        return file_put_contents(rtrim($path, '/\\') . DIRECTORY_SEPARATOR . $filename, $imageData) !== false;
    }
    return false;
}

function aidog_safe_image_filename($url, $index = 0) {
    $path = parse_url($url, PHP_URL_PATH);
    $ext = strtolower(pathinfo((string)$path, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
        $ext = 'jpg';
    }
    return 'aigou_' . date('YmdHis') . '_' . $index . '_' . substr(md5($url), 0, 10) . '.' . $ext;
}

function aidog_database_config($database) {
    $database = is_array($database) ? $database : [];
    $type = strtolower((string)($database['type'] ?? $database['driver'] ?? 'sqlite'));
    $host = $database['host'] ?? $database['hostname'] ?? $database['server'] ?? $database['hostport'] ?? '127.0.0.1';
    $dbname = $database['dbname'] ?? $database['database'] ?? $database['name'] ?? $database['database_name'] ?? $database['sqlite'] ?? $database['dbfile'] ?? $database['db_file'] ?? $database['database_file'] ?? '';
    $user = $database['user'] ?? $database['username'] ?? $database['database_user'] ?? '';
    $password = $database['passwd'] ?? $database['password'] ?? $database['pwd'] ?? '';
    $port = $database['port'] ?? $database['database_port'] ?? '';
    $prefix = $database['prefix'] ?? $database['database_prefix'] ?? 'ay_';

    if ($dbname === '') {
        throw new RuntimeException('没有读取到数据库名，请检查目标站 config/database.php 里的 dbname 或 database 配置');
    }

    return [$type, $host, $dbname, $user, $password, $port, $prefix];
}

function aidog_create_pdo($database) {
    [$type, $host, $dbname, $user, $password, $port] = aidog_database_config($database);

    if ($type === 'sqlite' || $type === 'pdo_sqlite') {
        $dbFile = $dbname;
        if ($dbFile !== '' && $dbFile[0] === '/') {
            $siteRootFile = __DIR__ . $dbFile;
            if (file_exists($siteRootFile)) {
                $dbFile = $siteRootFile;
            }
        } elseif ($dbFile !== '') {
            $dbFile = __DIR__ . '/' . $dbFile;
        }

        if (!file_exists($dbFile)) {
            throw new RuntimeException('SQLite 数据库文件不存在：' . $dbFile);
        }

        return new PDO('sqlite:' . $dbFile, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    $dsn = sprintf('mysql:host=%s;%sdbname=%s;charset=utf8mb4', $host, $port !== '' ? 'port=' . $port . ';' : '', $dbname);
    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function aidog_list_tables(PDO $pdo) {
    $driver = strtolower((string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    try {
        if ($driver === 'sqlite') {
            $stmt = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC");
            return array_values(array_filter(array_map(function ($row) {
                return $row['name'] ?? '';
            }, $stmt->fetchAll())));
        }

        $stmt = $pdo->query('SHOW TABLES');
        return array_values(array_filter(array_map(function ($row) {
            $values = array_values($row);
            return (string)($values[0] ?? '');
        }, $stmt->fetchAll())));
    } catch (Throwable $e) {
        return [];
    }
}

function aidog_table_exists(PDO $pdo, $table) {
    $driver = strtolower((string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    try {
        if ($driver === 'sqlite') {
            $stmt = $pdo->prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :name LIMIT 1");
            $stmt->execute([':name' => $table]);
            return (bool)$stmt->fetchColumn();
        }
        $stmt = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($table));
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function aidog_table_columns(PDO $pdo, $table) {
    $driver = strtolower((string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    try {
        if ($driver === 'sqlite') {
            $stmt = $pdo->query("PRAGMA table_info(`" . str_replace('`', '``', $table) . "`)");
            $rows = $stmt->fetchAll();
            return array_map(function ($row) {
                return $row['name'];
            }, $rows);
        }
        $stmt = $pdo->query("SHOW COLUMNS FROM `" . str_replace('`', '``', $table) . "`");
        $rows = $stmt->fetchAll();
        return array_map(function ($row) {
            return $row['Field'];
        }, $rows);
    } catch (Throwable $e) {
        return [];
    }
}

function aidog_first_existing_table(PDO $pdo, array $tables) {
    foreach ($tables as $table) {
        if ($table && aidog_table_exists($pdo, $table)) {
            return $table;
        }
    }
    return '';
}

function aidog_find_category_table(PDO $pdo, array $preferredTables) {
    $tables = aidog_list_tables($pdo);
    $ordered = [];
    foreach ($preferredTables as $table) {
        if ($table && in_array($table, $tables, true)) {
            $ordered[] = $table;
        }
    }

    $scored = [];
    foreach ($tables as $table) {
        $lower = strtolower($table);
        $score = 0;
        if (preg_match('/(^|_)content_sort$/', $lower)) $score += 100;
        if (preg_match('/(^|_)sort$/', $lower)) $score += 80;
        if (strpos($lower, 'content_sort') !== false) $score += 70;
        if (strpos($lower, 'category') !== false || strpos($lower, 'column') !== false || strpos($lower, 'catalog') !== false) $score += 50;
        if (strpos($lower, 'sort') !== false) $score += 40;
        if (!$score) continue;

        $columns = aidog_table_columns($pdo, $table);
        $hasId = in_array('scode', $columns, true) || in_array('id', $columns, true) || in_array('cate_id', $columns, true) || in_array('category_id', $columns, true);
        $hasName = in_array('name', $columns, true) || in_array('title', $columns, true) || in_array('catename', $columns, true) || in_array('category_name', $columns, true);
        if ($hasId && $hasName) {
            $scored[] = ['table' => $table, 'score' => $score];
        }
    }

    usort($scored, function ($a, $b) {
        return $b['score'] <=> $a['score'];
    });
    foreach ($scored as $item) {
        $ordered[] = $item['table'];
    }

    $ordered = array_values(array_unique($ordered));
    return [$ordered[0] ?? '', $tables];
}

function aidog_fetch_categories_from_db(PDO $pdo, $database, $mcode = '2') {
    [, , , , , , $prefix] = aidog_database_config($database);
    $prefix = (string)$prefix;
    $preferredTables = array_values(array_unique([
        $prefix . 'content_sort',
        'ay_content_sort',
        'content_sort',
        $prefix . 'sort',
        'ay_sort',
        $prefix . 'category',
        'ay_category',
        'category',
        $prefix . 'column',
        'ay_column',
        'column',
        $prefix . 'catalog',
        'ay_catalog',
        'catalog',
    ]));
    [$sortTable, $allTables] = aidog_find_category_table($pdo, $preferredTables);
    if ($sortTable === '') {
        $sample = $allTables ? implode(', ', array_slice($allTables, 0, 30)) : '无可读取表';
        throw new RuntimeException('没有找到栏目表，已扫描数据库表：' . $sample . '。常见栏目表为 ay_content_sort，也可能是二开表名。');
    }

    $columns = aidog_table_columns($pdo, $sortTable);
    $has = function ($name) use ($columns) {
        return in_array($name, $columns, true);
    };
    $idColumn = $has('scode') ? 'scode' : ($has('id') ? 'id' : ($has('cate_id') ? 'cate_id' : ($has('category_id') ? 'category_id' : '')));
    $nameColumn = $has('name') ? 'name' : ($has('title') ? 'title' : ($has('catename') ? 'catename' : ($has('category_name') ? 'category_name' : '')));
    $parentColumn = $has('pcode') ? 'pcode' : ($has('pid') ? 'pid' : ($has('parent_id') ? 'parent_id' : ($has('parentid') ? 'parentid' : '')));
    if ($idColumn === '' || $nameColumn === '') {
        throw new RuntimeException('栏目表 ' . $sortTable . ' 字段不兼容，现有字段：' . implode(', ', $columns));
    }

    $selectParent = $parentColumn ? "`$parentColumn` AS pcode" : "'0' AS pcode";
    $where = [];
    if ($has('outlink')) {
        $where[] = "(`outlink` = '' OR `outlink` IS NULL)";
    }
    if ($has('status')) {
        $where[] = "(`status` = 1 OR `status` = '1' OR `status` IS NULL)";
    }
    if ($has('isclose')) {
        $where[] = "(`isclose` = 0 OR `isclose` IS NULL)";
    }
    if ($has('mcode') && $mcode !== '') {
        $where[] = "(`mcode` = " . $pdo->quote((string)$mcode) . " OR `mcode` = " . (int)$mcode . ")";
    }
    $order = [];
    if ($parentColumn) $order[] = "`$parentColumn` ASC";
    if ($has('sorting')) $order[] = "`sorting` ASC";
    if ($has('sort')) $order[] = "`sort` ASC";
    if ($has('id')) $order[] = "`id` ASC";

    $sql = "SELECT `$idColumn` AS scode, `$nameColumn` AS name, $selectParent FROM `$sortTable`";
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    if ($order) {
        $sql .= ' ORDER BY ' . implode(', ', $order);
    }

    $stmt = $pdo->query($sql);
    $rows = array_values(array_filter($stmt->fetchAll(), function ($row) {
        return (string)($row['scode'] ?? '') !== '' && (string)($row['name'] ?? '') !== '';
    }));
    if (!$rows) {
        throw new RuntimeException('栏目表 ' . $sortTable . ' 存在，但没有读取到可用栏目');
    }
    return aidog_tree($rows, '0');
}

function aidog_resolve_category(PDO $pdo, $database, $category) {
    $category = aidog_clean($category);
    if ($category === '') {
        return ['scode' => '1', 'filename' => '1'];
    }

    try {
        [, , , , , , $prefix] = aidog_database_config($database);
        $preferredTables = array_values(array_unique([
            $prefix . 'content_sort',
            'ay_content_sort',
            'content_sort',
            $prefix . 'sort',
            'ay_sort',
            $prefix . 'category',
            'ay_category',
            'category',
            $prefix . 'column',
            'ay_column',
            'column',
            $prefix . 'catalog',
            'ay_catalog',
            'catalog',
        ]));
        [$sortTable] = aidog_find_category_table($pdo, $preferredTables);
        if ($sortTable === '') {
            return ['scode' => $category, 'filename' => $category];
        }

        $columns = aidog_table_columns($pdo, $sortTable);
        $has = function ($name) use ($columns) {
            return in_array($name, $columns, true);
        };
        $idColumn = $has('scode') ? 'scode' : ($has('id') ? 'id' : ($has('cate_id') ? 'cate_id' : ($has('category_id') ? 'category_id' : '')));
        $filenameColumn = $has('filename') ? 'filename' : ($has('urlname') ? 'urlname' : ($has('dirname') ? 'dirname' : ''));
        $nameColumn = $has('name') ? 'name' : ($has('title') ? 'title' : ($has('catename') ? 'catename' : ($has('category_name') ? 'category_name' : '')));
        if ($idColumn === '') {
            return ['scode' => $category, 'filename' => $category];
        }

        $conditions = ["`$idColumn` = :category"];
        if ($filenameColumn) $conditions[] = "`$filenameColumn` = :category";
        if ($nameColumn) $conditions[] = "`$nameColumn` = :category";

        $selectFilename = $filenameColumn ? "`$filenameColumn` AS filename" : "`$idColumn` AS filename";
        $sql = "SELECT `$idColumn` AS scode, $selectFilename FROM `$sortTable` WHERE " . implode(' OR ', $conditions) . " LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':category' => $category]);
        $row = $stmt->fetch();
        if (!$row) {
            return ['scode' => $category, 'filename' => $category];
        }
        return [
            'scode' => (string)($row['scode'] ?: $category),
            'filename' => (string)($row['filename'] ?: $row['scode'] ?: $category),
        ];
    } catch (Throwable $e) {
        return ['scode' => $category, 'filename' => $category];
    }
}

function aidog_normalize_nav_items($items) {
    if (!is_array($items)) {
        return [];
    }

    $result = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = $item['scode'] ?? $item['id'] ?? $item['value'] ?? null;
        $name = $item['name'] ?? $item['title'] ?? $item['label'] ?? '';
        if ($id === null || $name === '') {
            continue;
        }

        $children = $item['son'] ?? $item['sons'] ?? $item['children'] ?? $item['subsorts'] ?? [];
        $node = ['id' => (string)$id, 'name' => $name];
        $childNodes = aidog_normalize_nav_items($children);
        if ($childNodes) {
            $node['children'] = $childNodes;
        }
        $result[] = $node;
    }
    return $result;
}

function aidog_public_nav_categories() {
    $scheme = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($host === '') {
        return [];
    }

    $url = $scheme . '://' . $host . '/api.php/cms/nav';
    $body = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        $body = curl_exec($ch);
        curl_close($ch);
    }
    if (!$body && ini_get('allow_url_fopen')) {
        $body = @file_get_contents($url);
    }
    if (!$body) {
        return [];
    }

    $json = json_decode($body, true);
    if (!is_array($json)) {
        return [];
    }
    $items = $json['data']['list'] ?? $json['data'] ?? $json['result'] ?? $json['list'] ?? $json;
    return aidog_normalize_nav_items($items);
}

try {
    if ($action === 'categories') {
        $publicCategories = aidog_public_nav_categories();
        if ($publicCategories) {
            echo json_encode([
                'status' => 1,
                'success' => true,
                'source' => 'pboot-api',
                'categories' => $publicCategories,
                'flatCategories' => aidog_flat_categories($publicCategories),
                'selectHtml' => aidog_select($publicCategories),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $databaseFile = __DIR__ . '/config/database.php';
    if (!file_exists($databaseFile)) {
        throw new RuntimeException('没有找到 config/database.php，请确认桥接文件已上传到 PbootCMS 网站根目录');
    }
    $databaseReturn = require $databaseFile;
    if (isset($databaseReturn['database']) && is_array($databaseReturn['database'])) {
        $database = $databaseReturn['database'];
    } elseif (is_array($databaseReturn)) {
        $database = $databaseReturn;
    } elseif (!isset($database)) {
        $database = [];
    }
    $config = [];
    $configFile = __DIR__ . '/config/config.php';
    if (file_exists($configFile)) {
        require $configFile;
    }

    $pdo = aidog_create_pdo($database ?? []);

    if ($action === 'version') {
        echo json_encode(['status' => 1, 'success' => true, 'version' => 'v2.1'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'categories') {
        $tree = aidog_fetch_categories_from_db($pdo, $database ?? [], aidog_clean(aidog_value($payload, 'mcode', '2')));
        echo json_encode([
            'status' => 1,
            'success' => true,
            'source' => 'database',
            'categories' => $tree,
            'flatCategories' => aidog_flat_categories($tree),
            'selectHtml' => aidog_select($tree),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $title = aidog_clean(aidog_value($payload, 'title', ''));
    $content = aidog_clean(aidog_value($payload, 'content', ''));
    $scode = aidog_clean(aidog_value($payload, 'categoryId', aidog_value($payload, 'category_ids', aidog_value($payload, 'scode', '1'))));
    $categoryInfo = aidog_resolve_category($pdo, $database ?? [], $scode);
    $scode = $categoryInfo['scode'];

    if ($title === '' || $content === '') {
        http_response_code(400);
        echo json_encode(['status' => 0, 'success' => false, 'msg' => '��������ݲ���Ϊ��', 'message' => '��������ݲ���Ϊ��'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $acode = aidog_clean(aidog_value($payload, 'acode', 'cn'));
    $subscode = aidog_clean(aidog_value($payload, 'subscode', ''));
    $titlecolor = aidog_clean(aidog_value($payload, 'titlecolor', ''));
    $subtitle = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'subtitle', '')));
    $filename = aidog_clean(aidog_value($payload, 'filename', ''));
    $author = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'author', 'AIGOU')));
    $source = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'source', 'AIGOU')));
    $outlink = aidog_clean(aidog_value($payload, 'outlink', ''));
    $date = aidog_clean(aidog_value($payload, 'date', date('Y-m-d H:i:s')));
    $ico = aidog_clean(aidog_value($payload, 'ico', ''));
    $pics = aidog_clean(aidog_value($payload, 'pics', ''));
    $tags = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'tags', aidog_value($payload, 'tag', ''))));
    $enclosure = aidog_clean(aidog_value($payload, 'enclosure', ''));
    $keywords = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'keywords', '')));
    $description = str_replace("'", '&#039;', aidog_clean(aidog_value($payload, 'description', '')));
    $status = (int)aidog_value($payload, 'status', 1);
    $istop = (int)aidog_value($payload, 'istop', 0);
    $isrecommend = (int)aidog_value($payload, 'isrecommend', 0);
    $isheadline = (int)aidog_value($payload, 'isheadline', 0);
    $gid = (int)aidog_value($payload, 'gid', 0);
    $gtype = (int)aidog_value($payload, 'gtype', 4);
    $gnote = aidog_value($payload, 'gnote', '');

    if ($description === '') {
        $plain = preg_replace('/\s+/u', ' ', strip_tags($content));
        $description = mb_substr(trim($plain), 0, 200, 'utf-8');
    }

    preg_match_all('/https?:\/\/[^\s"\']+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"\']*)?/i', $content, $matches);
    foreach (($matches[0] ?? []) as $index => $imageUrl) {
        $safeName = aidog_safe_image_filename($imageUrl, $index);
        $localPath = __DIR__ . '/static/upload/image/downimg/';
        if (aidog_download_image($imageUrl, $localPath, $safeName)) {
            $localUrl = '/static/upload/image/downimg/' . $safeName;
            if ($ico === '') {
                $ico = $localUrl;
            }
            $content = str_replace($imageUrl, $localUrl, $content);
        }
    }

    $scodename = $categoryInfo['filename'] ?: $scode;

    $existsStmt = $pdo->prepare('SELECT id FROM ay_content WHERE title = :title ORDER BY id DESC LIMIT 1');
    $existsStmt->execute([':title' => $title]);
    $existRow = $existsStmt->fetch();

    $data = [
        ':acode' => $acode,
        ':scode' => $scode,
        ':subscode' => $subscode,
        ':title' => $title,
        ':titlecolor' => $titlecolor,
        ':subtitle' => $subtitle,
        ':filename' => $filename,
        ':author' => $author,
        ':source' => $source,
        ':outlink' => $outlink,
        ':date' => $date,
        ':ico' => $ico,
        ':pics' => $pics,
        ':content' => $content,
        ':tags' => $tags,
        ':enclosure' => $enclosure,
        ':keywords' => $keywords,
        ':description' => $description,
        ':status' => $status,
        ':istop' => $istop,
        ':isrecommend' => $isrecommend,
        ':isheadline' => $isheadline,
        ':gid' => $gid,
        ':gtype' => $gtype,
        ':gnote' => $gnote,
        ':create_time' => time(),
        ':update_time' => time(),
    ];

    $id = null;
    if ($existRow) {
        $id = (int)$existRow['id'];
        $stmt = $pdo->prepare(
            'UPDATE ay_content SET
                acode = :acode,
                scode = :scode,
                subscode = :subscode,
                title = :title,
                titlecolor = :titlecolor,
                subtitle = :subtitle,
                filename = :filename,
                author = :author,
                source = :source,
                outlink = :outlink,
                date = :date,
                ico = :ico,
                pics = :pics,
                content = :content,
                tags = :tags,
                enclosure = :enclosure,
                keywords = :keywords,
                description = :description,
                status = :status,
                istop = :istop,
                isrecommend = :isrecommend,
                isheadline = :isheadline,
                gid = :gid,
                gtype = :gtype,
                gnote = :gnote,
                create_time = :create_time,
                update_time = :update_time
             WHERE id = :id'
        );
        $stmt->execute($data + [':id' => $id]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO ay_content (
                acode, scode, subscode, title, titlecolor, subtitle, filename,
                author, source, outlink, date, ico, pics, content, tags,
                enclosure, keywords, description, sorting, status, istop,
                isrecommend, isheadline, visits, likes, oppose, create_user,
                update_user, gid, gtype, gnote, create_time, update_time
            ) VALUES (
                :acode, :scode, :subscode, :title, :titlecolor, :subtitle, :filename,
                :author, :source, :outlink, :date, :ico, :pics, :content, :tags,
                :enclosure, :keywords, :description, 255, :status, :istop,
                :isrecommend, :isheadline, 0, 0, 0, "AIGOU",
                "AIGOU", :gid, :gtype, :gnote, :create_time, :update_time
            )'
        );
        $stmt->execute($data);
        $id = (int)$pdo->lastInsertId();
    }

    $baseUrl = (isset($_SERVER['REQUEST_SCHEME']) ? $_SERVER['REQUEST_SCHEME'] : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    $urlRuleType = (int)($config['url_rule_type'] ?? 3);
    $urlRuleContentPath = (int)($config['url_rule_content_path'] ?? 0);
    if ($urlRuleType === 1) {
        $docFinalUrl = $baseUrl . '/index.php/' . $scodename . '/' . $id . '.html';
    } elseif ($urlRuleType === 2) {
        $docFinalUrl = $urlRuleContentPath === 1 ? $baseUrl . '/' . $id . '.html' : $baseUrl . '/' . $scodename . '/' . $id . '.html';
    } else {
        $docFinalUrl = $baseUrl . '/?' . $scodename . '/' . $id . '.html';
    }

    echo json_encode([
        'status' => 1,
        'success' => true,
        'msg' => $existRow ? '�������³ɹ�' : '������³ɹ�',
        'message' => $existRow ? '�������³ɹ�' : '������³ɹ�',
        'id' => $id,
        'url' => $docFinalUrl,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 0, 'success' => false, 'msg' => $error->getMessage(), 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
}
