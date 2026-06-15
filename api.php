<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

// Manejar peticiones de pre-vuelo de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

function write_api_log($message) {
    $log_file = __DIR__ . '/api_debug.log';
    $timestamp = date('Y-m-d H:i:s');
    @file_put_contents($log_file, "[$timestamp] $message\n", FILE_APPEND);
}

$config_file = __DIR__ . '/db_config.php';
$db_host = 'localhost';
$db_name = 'vsystemsv_ria';
$db_user = 'vsystemsv_ria';
$db_pass = 'Ria2026/*';

if (file_exists($config_file)) {
    include $config_file;
}

$connected = false;
$conn_error = '';
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);

    // 1. Auto-creación de la tabla de estado heredada (para migración si existe)
    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_state (
        id INT PRIMARY KEY AUTO_INCREMENT,
        state_key VARCHAR(50) UNIQUE,
        state_value LONGTEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // 2. Auto-creación de tablas estructuradas (relacionales)
    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_players (
        id BIGINT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        champion_prediction VARCHAR(100) NULL,
        champion_prediction_text VARCHAR(150) NULL,
        champion_prediction_id VARCHAR(100) NULL,
        bonus_points INT DEFAULT 0
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_predictions (
        player_id BIGINT,
        match_id VARCHAR(50),
        goals1 VARCHAR(5) NULL,
        goals2 VARCHAR(5) NULL,
        unlocked TINYINT DEFAULT 0,
        PRIMARY KEY (player_id, match_id)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_real_results (
        match_id VARCHAR(50) PRIMARY KEY,
        goals1 INT NULL,
        goals2 INT NULL,
        status VARCHAR(20) NOT NULL,
        api_data LONGTEXT NULL
    )");

    try {
        $pdo->exec("ALTER TABLE quiniela_real_results ADD COLUMN api_data LONGTEXT NULL");
    } catch (PDOException $e) {
        // Ignorar si la columna ya existe
    }

    try {
        $pdo->exec("ALTER TABLE quiniela_players ADD COLUMN bonus_points INT DEFAULT 0");
    } catch (PDOException $e) {
        // Ignorar si la columna ya existe
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_match_teams (
        match_id VARCHAR(50) PRIMARY KEY,
        team1 VARCHAR(100) NULL,
        team2 VARCHAR(100) NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_config (
        config_key VARCHAR(50) PRIMARY KEY,
        config_value VARCHAR(255) NULL
    )");

    // Asegurar que las tablas utilicen el juego de caracteres utf8mb4 para evitar fallas de codificación
    try {
        $pdo->exec("ALTER TABLE quiniela_players CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("ALTER TABLE quiniela_predictions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("ALTER TABLE quiniela_real_results CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("ALTER TABLE quiniela_match_teams CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("ALTER TABLE quiniela_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (PDOException $e) {
        // Ignorar si no se tienen permisos o falla
    }

    $connected = true;

    // 3. Ejecutar auto-migración de datos si existe el main_state anterior y las tablas estructuradas están vacías
    try {
        $stmtMigCheck = $pdo->prepare("SELECT state_value FROM quiniela_state WHERE state_key = 'main_state'");
        $stmtMigCheck->execute();
        $rowMig = $stmtMigCheck->fetch();
        
        if ($rowMig) {
            $countPlayers = intval($pdo->query("SELECT COUNT(*) FROM quiniela_players")->fetchColumn());
            if ($countPlayers === 0) {
                $state_json = json_decode($rowMig['state_value'], true);
                if ($state_json && is_array($state_json)) {
                    $pdo->beginTransaction();
                    try {
                        // Migrar jugadores y sus predicciones
                        if (isset($state_json['players']) && is_array($state_json['players'])) {
                            $stmtPlayer = $pdo->prepare("INSERT INTO quiniela_players (id, name, champion_prediction, champion_prediction_text, champion_prediction_id) VALUES (:id, :name, :champ, :champ_txt, :champ_id)");
                            $stmtPred = $pdo->prepare("INSERT INTO quiniela_predictions (player_id, match_id, goals1, goals2, unlocked) VALUES (:player_id, :match_id, :goals1, :goals2, :unlocked)");
                            
                            foreach ($state_json['players'] as $p) {
                                if (isset($p['id']) && isset($p['name'])) {
                                    $stmtPlayer->execute([
                                        'id' => $p['id'],
                                        'name' => $p['name'],
                                        'champ' => isset($p['championPrediction']) ? $p['championPrediction'] : null,
                                        'champ_txt' => isset($p['championPredictionText']) ? $p['championPredictionText'] : null,
                                        'champ_id' => isset($p['championPredictionId']) ? $p['championPredictionId'] : null
                                    ]);
                                    
                                    if (isset($p['predictions']) && is_array($p['predictions'])) {
                                        foreach ($p['predictions'] as $mId => $pred) {
                                            $unlocked = isset($pred['unlocked']) && $pred['unlocked'] ? 1 : 0;
                                            $stmtPred->execute([
                                                'player_id' => $p['id'],
                                                'match_id' => $mId,
                                                'goals1' => (isset($pred['goals1']) && $pred['goals1'] !== "") ? $pred['goals1'] : null,
                                                'goals2' => (isset($pred['goals2']) && $pred['goals2'] !== "") ? $pred['goals2'] : null,
                                                'unlocked' => $unlocked
                                            ]);
                                        }
                                    }
                                }
                            }
                        }

                        // Migrar resultados reales
                        if (isset($state_json['realResults']) && is_array($state_json['realResults'])) {
                            $stmtReal = $pdo->prepare("INSERT INTO quiniela_real_results (match_id, goals1, goals2, status) VALUES (:match_id, :goals1, :goals2, :status)");
                            foreach ($state_json['realResults'] as $mId => $r) {
                                $stmtReal->execute([
                                    'match_id' => $mId,
                                    'goals1' => ($r['goals1'] !== null && $r['goals1'] !== "") ? intval($r['goals1']) : null,
                                    'goals2' => ($r['goals2'] !== null && $r['goals2'] !== "") ? intval($r['goals2']) : null,
                                    'status' => isset($r['status']) ? $r['status'] : 'scheduled'
                                ]);
                            }
                        }

                        // Migrar nombres de equipos editados
                        if (isset($state_json['matchTeams']) && is_array($state_json['matchTeams'])) {
                            $stmtTeam = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) VALUES (:match_id, :team1, :team2)");
                            foreach ($state_json['matchTeams'] as $mId => $t) {
                                $stmtTeam->execute([
                                    'match_id' => $mId,
                                    'team1' => isset($t['team1']) ? $t['team1'] : null,
                                    'team2' => isset($t['team2']) ? $t['team2'] : null
                                ]);
                            }
                        }

                        // Migrar config & realChampion
                        $stmtCfg = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) VALUES (:key, :val)");
                        if (isset($state_json['config']) && is_array($state_json['config'])) {
                            foreach ($state_json['config'] as $k => $v) {
                                if (is_bool($v)) {
                                    $v = $v ? '1' : '0';
                                }
                                $stmtCfg->execute([
                                    'key' => $k,
                                    'val' => ($v !== null) ? strval($v) : null
                                ]);
                            }
                        }
                        if (isset($state_json['realChampion'])) {
                            $stmtCfg->execute([
                                'key' => 'realChampion',
                                'val' => $state_json['realChampion']
                            ]);
                        }

                        $pdo->commit();
                        write_api_log("MIGRACIÓN COMPLETA: Estado consolidado JSON migrado exitosamente a tablas relacionales.");
                        
                        // Eliminar el antiguo registro JSON consolidado para no repetir la migración
                        $pdo->exec("DELETE FROM quiniela_state WHERE state_key = 'main_state'");
                    } catch (Exception $eInner) {
                        $pdo->rollBack();
                        error_log("Error interno en la migración de quiniela: " . $eInner->getMessage());
                        write_api_log("ERROR MIGRACIÓN INTERNA: " . $eInner->getMessage());
                    }
                }
            }
        }
    } catch (PDOException $eMig) {
        error_log("Error de base de datos durante la verificación de migración: " . $eMig->getMessage());
        write_api_log("ERROR EN MIGRACIÓN: " . $eMig->getMessage());
    }
} catch (PDOException $e) {
    $conn_error = $e->getMessage();
    write_api_log("ERROR DE CONEXIÓN A BASE DE DATOS: " . $conn_error);
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// Manejar peticiones que no dependen de que la BD ya esté conectada
if ($action === 'save_db_config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data || !isset($data['db_host']) || !isset($data['db_name']) || !isset($data['db_user']) || !isset($data['db_pass'])) {
        echo json_encode(['status' => 'error', 'message' => 'Datos de configuración incompletos.']);
        exit;
    }
    
    if ($connected) {
        $stmt = $pdo->prepare("SELECT state_value FROM quiniela_state WHERE state_key = 'main_state'");
        $stmt->execute();
        $row = $stmt->fetch();
        $pin = '1234';
        if ($row) {
            $state_data = json_decode($row['state_value'], true);
            if (isset($state_data['config']['adminPin'])) {
                $pin = $state_data['config']['adminPin'];
            }
        }
        
        $user_pin = isset($data['admin_pin']) ? $data['admin_pin'] : '';
        if ($user_pin !== $pin) {
            echo json_encode(['status' => 'error', 'message' => 'Acceso denegado: PIN de administrador incorrecto.']);
            exit;
        }
    }
    
    $new_host = addslashes($data['db_host']);
    $new_name = addslashes($data['db_name']);
    $new_user = addslashes($data['db_user']);
    $new_pass = (isset($data['db_pass']) && $data['db_pass'] !== '') ? addslashes($data['db_pass']) : $db_pass;
    
    $config_content = "<?php\n"
                    . "// Configuración de base de datos auto-generada\n"
                    . "\$db_host = '$new_host';\n"
                    . "\$db_name = '$new_name';\n"
                    . "\$db_user = '$new_user';\n"
                    . "\$db_pass = '$new_pass';\n";
                    
    $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
    if (file_put_contents($config_file, $config_content) !== false) {
        try {
            $test_pdo = new PDO("mysql:host=$new_host;dbname=$new_name;charset=utf8", $new_user, $new_pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
            write_api_log("ADMIN: Configuración de BD actualizada. Host: $new_host, DB: $new_name, Usuario: $new_user. IP: $ip_cliente");
            echo json_encode(['status' => 'success', 'message' => 'Configuración de base de datos actualizada y conectada con éxito.']);
        } catch (PDOException $e) {
            write_api_log("ADMIN: Configuración de BD guardada pero prueba de conexión fallida. Host: $new_host, DB: $new_name. IP: $ip_cliente. Error: " . $e->getMessage());
            echo json_encode(['status' => 'warning', 'message' => 'Configuración guardada, pero la prueba de conexión falló: ' . $e->getMessage()]);
        }
    } else {
        write_api_log("ERROR: No se pudo escribir db_config.php. IP: $ip_cliente");
        echo json_encode(['status' => 'error', 'message' => 'No se pudo escribir el archivo db_config.php. Verifique los permisos del servidor.']);
    }
    exit;
}

if ($action === 'get_db_config') {
    echo json_encode([
        'status' => 'success',
        'db_host' => $db_host,
        'db_name' => $db_name,
        'db_user' => $db_user,
        'db_connected' => $connected,
        'conn_error' => $conn_error
    ]);
    exit;
}

// Si la BD no está conectada, salir con error para otras acciones
if (!$connected) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Error de conexión a la base de datos. Por favor, configura las credenciales de tu base de datos MySQL en la pestaña de Ajustes del Administrador. Detalles: ' . $conn_error
    ]);
    exit;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === 'get') {
    try {
        // 1. Consultar configs
        $config = [
            'pointsExact' => 3,
            'pointsWinner' => 1,
            'pointsClosest' => 1,
            'pointsChampion' => 10,
            'adminPin' => '1234',
            'theme' => 'dark',
            'championVotingClosed' => false
        ];
        $realChampion = null;

        $stmtCfg = $pdo->query("SELECT * FROM quiniela_config");
        foreach ($stmtCfg->fetchAll() as $c) {
            $k = $c['config_key'];
            $v = $c['config_value'];
            if ($k === 'realChampion') {
                $realChampion = $v;
            } else {
                if ($k === 'pointsExact' || $k === 'pointsWinner' || $k === 'pointsClosest' || $k === 'pointsChampion') {
                    $config[$k] = intval($v);
                } elseif ($k === 'championVotingClosed') {
                    $config[$k] = intval($v) === 1;
                } else {
                    $config[$k] = $v;
                }
            }
        }

        // 2. Consultar resultados reales
        $realResults = new stdClass();
        $stmtReal = $pdo->query("SELECT * FROM quiniela_real_results");
        foreach ($stmtReal->fetchAll() as $r) {
            $realResults->{$r['match_id']} = [
                'goals1' => $r['goals1'] !== null ? intval($r['goals1']) : null,
                'goals2' => $r['goals2'] !== null ? intval($r['goals2']) : null,
                'status' => $r['status'],
                'api_data' => isset($r['api_data']) && $r['api_data'] !== null ? json_decode($r['api_data'], true) : null
            ];
        }

        // 3. Consultar nombres de equipos editados
        $matchTeams = new stdClass();
        $stmtTeam = $pdo->query("SELECT * FROM quiniela_match_teams");
        foreach ($stmtTeam->fetchAll() as $t) {
            $matchTeams->{$t['match_id']} = [
                'team1' => $t['team1'],
                'team2' => $t['team2']
            ];
        }

        // 4. Cargar matches.js para conocer los partidos y poder hacer los cálculos
        $local_matches = [];
        $matches_file = __DIR__ . '/matches.js';
        if (file_exists($matches_file)) {
            $js_content = file_get_contents($matches_file);
            $start_pos = strpos($js_content, '[');
            $end_pos = strrpos($js_content, ']') + 1;
            if ($start_pos !== false && $end_pos !== false) {
                $json_str = substr($js_content, $start_pos, $end_pos - $start_pos);
                $local_matches = json_decode($json_str, true) ?: [];
            }
        }

        // 5. Consultar jugadores
        $stmt = $pdo->query("SELECT * FROM quiniela_players ORDER BY name ASC");
        $db_players = $stmt->fetchAll();

        // 6. Consultar predicciones
        $preds = [];
        $stmtPred = $pdo->query("SELECT * FROM quiniela_predictions");
        foreach ($stmtPred->fetchAll() as $pr) {
            $pId = $pr['player_id'];
            $mId = $pr['match_id'];
            if (!isset($preds[$pId])) {
                $preds[$pId] = [];
            }
            $preds[$pId][$mId] = [
                'goals1' => $pr['goals1'],
                'goals2' => $pr['goals2'],
                'unlocked' => intval($pr['unlocked']) === 1
            ];
        }

        // 7. Pre-calcular minDistance para cada partido finalizado
        $minDistances = [];
        $ptsExactCfg = isset($config['pointsExact']) ? intval($config['pointsExact']) : 3;
        $ptsWinnerCfg = isset($config['pointsWinner']) ? intval($config['pointsWinner']) : 1;
        $ptsClosestCfg = isset($config['pointsClosest']) ? intval($config['pointsClosest']) : 1;
        $ptsChampionCfg = isset($config['pointsChampion']) ? intval($config['pointsChampion']) : 10;

        foreach ($local_matches as $match) {
            $mId = $match['id'];
            if (isset($realResults->{$mId})) {
                $real = $realResults->{$mId};
                if ($real['status'] === 'finished') {
                    $r1 = $real['goals1'];
                    $r2 = $real['goals2'];
                    if ($r1 !== null && $r2 !== null) {
                        $minDist = 999999;
                        foreach ($db_players as $db_p) {
                            $pId = $db_p['id'];
                            if (isset($preds[$pId][$mId])) {
                                $pred = $preds[$pId][$mId];
                                if ($pred['goals1'] !== null && $pred['goals1'] !== '' && $pred['goals2'] !== null && $pred['goals2'] !== '') {
                                    $p1 = intval($pred['goals1']);
                                    $p2 = intval($pred['goals2']);
                                    
                                    $isExact = ($p1 === $r1 && $p2 === $r2);
                                    if (!$isExact) {
                                        $dist = abs($p1 - $r1) + abs($p2 - $r2);
                                        if ($dist < $minDist) {
                                            $minDist = $dist;
                                        }
                                    }
                                }
                            }
                        }
                        $minDistances[$mId] = $minDist;
                    }
                }
            }
        }

        // 8. Construir lista de jugadores con puntos totales pre-calculados (sumando bonus_points y predicciones)
        $players = [];
        foreach ($db_players as $db_p) {
            $pId = $db_p['id'];
            $bonus = isset($db_p['bonus_points']) ? intval($db_p['bonus_points']) : 0;
            $totalPoints = $bonus;

            if (isset($preds[$pId])) {
                foreach ($preds[$pId] as $mId => $pred) {
                    if (isset($realResults->{$mId})) {
                        $real = $realResults->{$mId};
                        if ($real['status'] === 'finished') {
                            $r1 = $real['goals1'];
                            $r2 = $real['goals2'];
                            
                            if ($r1 !== null && $r2 !== null && $pred['goals1'] !== null && $pred['goals1'] !== '' && $pred['goals2'] !== null && $pred['goals2'] !== '') {
                                $p1 = intval($pred['goals1']);
                                $p2 = intval($pred['goals2']);
                                
                                if ($p1 === $r1 && $p2 === $r2) {
                                    $totalPoints += ($ptsExactCfg + $ptsWinnerCfg);
                                } else {
                                    $predDiff = $p1 - $p2;
                                    $realDiff = $r1 - $r2;
                                    $isWinner = ($predDiff > 0 && $realDiff > 0) || ($predDiff < 0 && $realDiff < 0) || ($predDiff === 0 && $realDiff === 0);
                                    
                                    $pointsEarned = 0;
                                    if ($isWinner) {
                                        $pointsEarned += $ptsWinnerCfg;
                                    }
                                    
                                    $minDist = isset($minDistances[$mId]) ? $minDistances[$mId] : 999999;
                                    $dist = abs($p1 - $r1) + abs($p2 - $r2);
                                    if ($minDist !== 999999 && $dist === $minDist) {
                                        $pointsEarned += $ptsClosestCfg;
                                    }
                                    
                                    $totalPoints += $pointsEarned;
                                }
                            }
                        }
                    }
                }
            }

            // Puntos de campeón
            if ($db_p['champion_prediction'] && $realChampion) {
                if ($db_p['champion_prediction'] === $realChampion) {
                    $totalPoints += $ptsChampionCfg;
                }
            }

            $players[] = [
                'id' => (string)$pId,
                'name' => $db_p['name'],
                'championPrediction' => $db_p['champion_prediction'],
                'championPredictionText' => $db_p['champion_prediction_text'],
                'championPredictionId' => $db_p['champion_prediction_id'],
                'bonusPoints' => $bonus,
                'points' => $totalPoints,        // Añadido para compatibilidad con otros procesos
                'totalPoints' => $totalPoints,   // Añadido para compatibilidad con otros procesos
                'predictions' => isset($preds[$pId]) ? $preds[$pId] : new stdClass()
            ];
        }

        echo json_encode([
            'players' => $players,
            'realResults' => $realResults,
            'matchTeams' => $matchTeams,
            'config' => $config,
            'realChampion' => $realChampion
        ]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al ensamblar el estado consolidado: ' . $e->getMessage()]);
    }
    exit;
}

// 2. Endpoint REST: Guardar Pronóstico Individual
if ($action === 'save_prediction' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['player_id']) && isset($data['match_id'])) {
        $pId = sprintf('%.0f', $data['player_id']);
        $mId = $data['match_id'];
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        if (isset($data['delete']) && $data['delete']) {
            $stmt = $pdo->prepare("DELETE FROM quiniela_predictions WHERE player_id = :pId AND match_id = :mId");
            $stmt->execute(['pId' => $pId, 'mId' => $mId]);
            write_api_log("Pronóstico ELIMINADO - Jugador: $pId, Partido: $mId. IP: $ip_cliente");
        } else {
            $stmt = $pdo->prepare("INSERT INTO quiniela_predictions (player_id, match_id, goals1, goals2, unlocked) 
                                   VALUES (:pId, :mId, :g1, :g2, :unlocked) 
                                   ON DUPLICATE KEY UPDATE goals1 = :g1, goals2 = :g2, unlocked = :unlocked");
            $stmt->execute([
                'pId' => $pId,
                'mId' => $mId,
                'g1' => ($data['goals1'] !== null && $data['goals1'] !== "") ? $data['goals1'] : null,
                'g2' => ($data['goals2'] !== null && $data['goals2'] !== "") ? $data['goals2'] : null,
                'unlocked' => isset($data['unlocked']) && $data['unlocked'] ? 1 : 0
            ]);
            write_api_log("Pronóstico guardado - Jugador: $pId, Partido: $mId, Marcador: " . ($data['goals1'] ?? 'N/A') . "-" . ($data['goals2'] ?? 'N/A') . " (unlocked: " . (isset($data['unlocked']) && $data['unlocked'] ? 'si' : 'no') . "). IP: $ip_cliente");
        }
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos insuficientes.']);
    }
    exit;
}

// 3. Endpoint REST: Guardar Voto Campeón Individual
if ($action === 'save_champion_vote' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['player_id'])) {
        $pId = sprintf('%.0f', $data['player_id']);
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        $stmt = $pdo->prepare("UPDATE quiniela_players 
                               SET champion_prediction = :champ, champion_prediction_text = :txt, champion_prediction_id = :cid 
                               WHERE id = :pId");
        $stmt->execute([
            'pId' => $pId,
            'champ' => isset($data['championPrediction']) ? $data['championPrediction'] : null,
            'txt' => isset($data['championPredictionText']) ? $data['championPredictionText'] : null,
            'cid' => isset($data['championPredictionId']) ? $data['championPredictionId'] : null
        ]);
        write_api_log("Voto campeón guardado - Jugador: $pId, Selección: " . ($data['championPredictionText'] ?? 'N/A') . ". IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos insuficientes.']);
    }
    exit;
}

// 3.5 Endpoint REST: Guardar Puntos de Ajuste (Bonus) de un Jugador
if ($action === 'save_bonus_points' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['player_id']) && isset($data['bonus_points'])) {
        $pId = sprintf('%.0f', $data['player_id']);
        $bonus = intval($data['bonus_points']);
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        // Obtener nombre del jugador para el log
        $stmtName = $pdo->prepare("SELECT name FROM quiniela_players WHERE id = :pId");
        $stmtName->execute(['pId' => $pId]);
        $playerName = $stmtName->fetchColumn() ?: "ID:$pId";
        $stmt = $pdo->prepare("UPDATE quiniela_players SET bonus_points = :bonus WHERE id = :pId");
        $stmt->execute(['pId' => $pId, 'bonus' => $bonus]);
        write_api_log("ADMIN: Puntos de ajuste guardados - Jugador: $playerName (ID: $pId), Puntos: $bonus. IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos insuficientes.']);
    }
    exit;
}

// 4. Endpoint REST: Guardar Resultado Real Individual (o Limpieza)
if ($action === 'save_real_result' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
    if ($data) {
        if (isset($data['match_id']) && $data['match_id'] === 'all' && isset($data['reset']) && $data['reset']) {
            $pdo->exec("DELETE FROM quiniela_real_results");
            write_api_log("ADMIN: Limpieza de TODOS los marcadores reales. IP: $ip_cliente");
            echo json_encode(['status' => 'success']);
        } elseif (isset($data['match_id'])) {
            $stmt = $pdo->prepare("INSERT INTO quiniela_real_results (match_id, goals1, goals2, status, api_data) 
                                   VALUES (:mId, :g1, :g2, :status, :apiData) 
                                   ON DUPLICATE KEY UPDATE goals1 = :g1, goals2 = :g2, status = :status, api_data = :apiData");
            $stmt->execute([
                'mId' => $data['match_id'],
                'g1' => ($data['goals1'] !== null && $data['goals1'] !== "") ? intval($data['goals1']) : null,
                'g2' => ($data['goals2'] !== null && $data['goals2'] !== "") ? intval($data['goals2']) : null,
                'status' => isset($data['status']) ? $data['status'] : 'scheduled',
                'apiData' => isset($data['api_data']) ? (is_array($data['api_data']) ? json_encode($data['api_data'], JSON_UNESCAPED_UNICODE) : $data['api_data']) : null
            ]);
            write_api_log("ADMIN: Resultado real guardado - Partido: " . $data['match_id'] . ", Marcador: " . ($data['goals1'] ?? 'N/A') . "-" . ($data['goals2'] ?? 'N/A') . ", Estado: " . ($data['status'] ?? 'N/A') . ", Has api_data: " . (isset($data['api_data']) ? 'yes' : 'no') . ". IP: $ip_cliente");
            echo json_encode(['status' => 'success']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Datos de partido no especificados.']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Cuerpo JSON vacío.']);
    }
    exit;
}

// 5. Endpoint REST: Guardar Equipo Personalizado
if ($action === 'save_match_team' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['match_id'])) {
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        $stmt = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) 
                               VALUES (:mId, :t1, :t2) 
                               ON DUPLICATE KEY UPDATE team1 = :t1, team2 = :t2");
        $stmt->execute([
            'mId' => $data['match_id'],
            't1' => isset($data['team1']) ? $data['team1'] : null,
            't2' => isset($data['team2']) ? $data['team2'] : null
        ]);
        write_api_log("ADMIN: Equipos personalizados guardados - Partido: " . $data['match_id'] . ", Eq1: " . ($data['team1'] ?? 'N/A') . ", Eq2: " . ($data['team2'] ?? 'N/A') . ". IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos insuficientes.']);
    }
    exit;
}

// 6. Endpoint REST: Guardar Configuraciones de Puntos
if ($action === 'save_config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && is_array($data)) {
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        $stmt = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) 
                               VALUES (:key, :val) 
                               ON DUPLICATE KEY UPDATE config_value = :val");
        $cambios = [];
        foreach ($data as $k => $v) {
            $vOrig = $v;
            if (is_bool($v)) {
                $v = $v ? '1' : '0';
            }
            // Ocultar PIN en el log por seguridad
            $cambios[] = $k . '=' . ($k === 'adminPin' ? '***' : strval($vOrig));
            $stmt->execute([
                'key' => $k,
                'val' => $v !== null ? strval($v) : null
            ]);
        }
        write_api_log("ADMIN: Configuración del sistema actualizada. Cambios: [" . implode(', ', $cambios) . "]. IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Cuerpo JSON no es un arreglo válido.']);
    }
    exit;
}

// 7. Endpoint REST: Guardar Campeón Oficial
if ($action === 'save_real_champion' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['realChampion'])) {
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        $stmt = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) 
                               VALUES ('realChampion', :val) 
                               ON DUPLICATE KEY UPDATE config_value = :val");
        $stmt->execute(['val' => $data['realChampion']]);
        write_api_log("ADMIN: Campeón oficial guardado: " . $data['realChampion'] . ". IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos insuficientes.']);
    }
    exit;
}

// 8. Endpoint REST: Agregar Jugador
if ($action === 'add_player' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['id']) && isset($data['name'])) {
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        $stmt = $pdo->prepare("INSERT INTO quiniela_players (id, name) VALUES (:id, :name)");
        $stmt->execute([
            'id' => sprintf('%.0f', $data['id']),
            'name' => $data['name']
        ]);
        write_api_log("ADMIN: Jugador agregado - ID: " . $data['id'] . ", Nombre: " . $data['name'] . ". IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Datos de jugador insuficientes.']);
    }
    exit;
}

// 9. Endpoint REST: Eliminar Jugador
if ($action === 'delete_player' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if ($data && isset($data['id'])) {
        $pId = sprintf('%.0f', $data['id']);
        $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
        // Obtener nombre antes de eliminar
        $stmtName = $pdo->prepare("SELECT name FROM quiniela_players WHERE id = :id");
        $stmtName->execute(['id' => $pId]);
        $playerName = $stmtName->fetchColumn() ?: "ID:$pId";
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("DELETE FROM quiniela_players WHERE id = :id");
            $stmt->execute(['id' => $pId]);
            $stmt = $pdo->prepare("DELETE FROM quiniela_predictions WHERE player_id = :id");
            $stmt->execute(['id' => $pId]);
            $pdo->commit();
            write_api_log("ADMIN: Jugador eliminado - Nombre: $playerName (ID: $pId). IP: $ip_cliente");
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            $pdo->rollBack();
            write_api_log("ERROR: Fallo al eliminar jugador $playerName (ID: $pId). IP: $ip_cliente. Error: " . $e->getMessage());
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Id de jugador no especificado.']);
    }
    exit;
}

// 10. Endpoint REST: Restablecer Jugadores
if ($action === 'reset_players' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM quiniela_players");
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->commit();
        write_api_log("ADMIN ⚠️: Se eliminaron TODOS los jugadores y sus pronósticos. IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        $pdo->rollBack();
        write_api_log("ERROR: Fallo en reset_players. IP: $ip_cliente. Error: " . $e->getMessage());
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// 11. Endpoint REST: Restablecer Todo
if ($action === 'reset_all' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $ip_cliente = $_SERVER['REMOTE_ADDR'] ?? 'IP desconocida';
    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM quiniela_players");
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->exec("DELETE FROM quiniela_real_results");
        $pdo->exec("DELETE FROM quiniela_match_teams");
        $pdo->exec("DELETE FROM quiniela_config");
        $pdo->commit();
        write_api_log("ADMIN 🚨: Reinicio COMPLETO de todo el sistema de quiniela. IP: $ip_cliente");
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        $pdo->rollBack();
        write_api_log("ERROR: Fallo en reset_all. IP: $ip_cliente. Error: " . $e->getMessage());
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// Helper para importar un estado JSON consolidado completo
function importFullStateJSON($pdo, $state_json) {
    if (!$state_json || !is_array($state_json)) {
        return ['status' => 'error', 'message' => 'JSON de importación inválido.'];
    }

    $pdo->beginTransaction();
    try {
        // Limpiar todo antes de la importación
        $pdo->exec("DELETE FROM quiniela_players");
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->exec("DELETE FROM quiniela_real_results");
        $pdo->exec("DELETE FROM quiniela_match_teams");
        $pdo->exec("DELETE FROM quiniela_config");

        // Players & predictions
        if (isset($state_json['players']) && is_array($state_json['players'])) {
            $stmtPlayer = $pdo->prepare("INSERT INTO quiniela_players (id, name, champion_prediction, champion_prediction_text, champion_prediction_id, bonus_points) VALUES (:id, :name, :champ, :champ_txt, :champ_id, :bonus)
                                        ON DUPLICATE KEY UPDATE name = :name, champion_prediction = :champ, champion_prediction_text = :champ_txt, champion_prediction_id = :champ_id, bonus_points = :bonus");
            $stmtPred = $pdo->prepare("INSERT INTO quiniela_predictions (player_id, match_id, goals1, goals2, unlocked) VALUES (:player_id, :match_id, :goals1, :goals2, :unlocked)");
            
            foreach ($state_json['players'] as $p) {
                if (isset($p['id']) && isset($p['name'])) {
                    $pId = sprintf('%.0f', $p['id']);
                    $stmtPlayer->execute([
                        'id' => $pId,
                        'name' => $p['name'],
                        'champ' => isset($p['championPrediction']) ? $p['championPrediction'] : null,
                        'champ_txt' => isset($p['championPredictionText']) ? $p['championPredictionText'] : null,
                        'champ_id' => isset($p['championPredictionId']) ? $p['championPredictionId'] : null,
                        'bonus' => isset($p['bonusPoints']) ? intval($p['bonusPoints']) : 0
                    ]);
                    
                    if (isset($p['predictions']) && is_array($p['predictions'])) {
                        foreach ($p['predictions'] as $mId => $pred) {
                            $unlocked = isset($pred['unlocked']) && $pred['unlocked'] ? 1 : 0;
                            $stmtPred->execute([
                                'player_id' => $pId,
                                'match_id' => $mId,
                                'goals1' => (isset($pred['goals1']) && $pred['goals1'] !== "") ? $pred['goals1'] : null,
                                'goals2' => (isset($pred['goals2']) && $pred['goals2'] !== "") ? $pred['goals2'] : null,
                                'unlocked' => $unlocked
                            ]);
                        }
                    }
                }
            }
        }

        // Real results
        if (isset($state_json['realResults']) && is_array($state_json['realResults'])) {
            $stmtReal = $pdo->prepare("INSERT INTO quiniela_real_results (match_id, goals1, goals2, status, api_data) VALUES (:match_id, :goals1, :goals2, :status, :api_data)");
            foreach ($state_json['realResults'] as $mId => $r) {
                $apiDataVal = null;
                if (isset($r['api_data'])) {
                    $apiDataVal = is_array($r['api_data']) ? json_encode($r['api_data'], JSON_UNESCAPED_UNICODE) : $r['api_data'];
                }
                $stmtReal->execute([
                    'match_id' => $mId,
                    'goals1' => ($r['goals1'] !== null && $r['goals1'] !== "") ? intval($r['goals1']) : null,
                    'goals2' => ($r['goals2'] !== null && $r['goals2'] !== "") ? intval($r['goals2']) : null,
                    'status' => isset($r['status']) ? $r['status'] : 'scheduled',
                    'api_data' => $apiDataVal
                ]);
            }
        }

        // Custom team names
        if (isset($state_json['matchTeams']) && is_array($state_json['matchTeams'])) {
            $stmtTeam = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) VALUES (:match_id, :team1, :team2)");
            foreach ($state_json['matchTeams'] as $mId => $t) {
                $stmtTeam->execute([
                    'match_id' => $mId,
                    'team1' => isset($t['team1']) ? $t['team1'] : null,
                    'team2' => isset($t['team2']) ? $t['team2'] : null
                ]);
            }
        }

        // Config & realChampion
        $stmtCfg = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) VALUES (:key, :val)");
        if (isset($state_json['config']) && is_array($state_json['config'])) {
            foreach ($state_json['config'] as $k => $v) {
                if (is_bool($v)) {
                    $v = $v ? '1' : '0';
                }
                $stmtCfg->execute([
                    'key' => $k,
                    'val' => ($v !== null) ? strval($v) : null
                ]);
            }
        }
        if (isset($state_json['realChampion'])) {
            $stmtCfg->execute([
                'key' => 'realChampion',
                'val' => $state_json['realChampion']
            ]);
        }

        $pdo->commit();
        write_api_log("ADMIN: Importación masiva de estado JSON consolidado completada exitosamente.");
        return ['status' => 'success', 'message' => 'Importación de estado completa realizada con éxito.'];
    } catch (Exception $e) {
        $pdo->rollBack();
        write_api_log("ERROR EN IMPORTACIÓN MASIVA: " . $e->getMessage());
        return ['status' => 'error', 'message' => 'Fallo en la importación: ' . $e->getMessage()];
    }
}

// 12. Endpoint REST: Importación de estado masivo
// ENDPOINT DESHABILITADO: import_state
// Esta acción fue bloqueada permanentemente para prevenir que versiones
// antiguas de app.js (en caché del navegador) puedan borrar la base de datos.
// La restauración masiva solo está permitida desde recuperar_logs.php (con PIN de admin).
if ($action === 'import_state' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    write_api_log("ADVERTENCIA DE SEGURIDAD: Se intentó ejecutar 'import_state' (sobrescritura masiva) desde " . ($_SERVER['REMOTE_ADDR'] ?? 'IP desconocida') . ". Acción BLOQUEADA.");
    header('HTTP/1.1 403 Forbidden');
    echo json_encode(['status' => 'error', 'message' => 'Esta operación de sobrescritura masiva está deshabilitada por seguridad. Usa recuperar_logs.php para restauraciones autorizadas.']);
    exit;
}

// ENDPOINT DESHABILITADO: save (sobrescritura masiva completa)
// Esta acción fue el vector del incidente de borrado de datos.
// Ha sido bloqueada permanentemente. Los clientes modernos usan endpoints
// dedicados (save_prediction, save_champion_vote, etc.) para cambios atómicos.
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    write_api_log("ADVERTENCIA DE SEGURIDAD: Se intentó ejecutar 'save' (sobrescritura masiva) desde " . ($_SERVER['REMOTE_ADDR'] ?? 'IP desconocida') . ". Acción BLOQUEADA. Probablemente un cliente con caché antigua.");
    header('HTTP/1.1 403 Forbidden');
    echo json_encode(['status' => 'error', 'message' => 'La sobrescritura masiva del estado está deshabilitada. Actualiza la página para cargar la última versión de la aplicación (Ctrl+F5 / Cmd+Shift+R).']);
    exit;
}

// Acción desconocida
echo json_encode(['status' => 'error', 'message' => 'Acción no soportada.']);
