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
        champion_prediction_id VARCHAR(100) NULL
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
                    
    if (file_put_contents($config_file, $config_content) !== false) {
        try {
            $test_pdo = new PDO("mysql:host=$new_host;dbname=$new_name;charset=utf8", $new_user, $new_pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
            echo json_encode(['status' => 'success', 'message' => 'Configuración de base de datos actualizada y conectada con éxito.']);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'warning', 'message' => 'Configuración guardada, pero la prueba de conexión falló: ' . $e->getMessage()]);
        }
    } else {
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
        // Consultar jugadores
        $players = [];
        $stmt = $pdo->query("SELECT * FROM quiniela_players ORDER BY name ASC");
        $db_players = $stmt->fetchAll();

        // Consultar predicciones
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

        foreach ($db_players as $db_p) {
            $pId = $db_p['id'];
            $players[] = [
                'id' => intval($pId),
                'name' => $db_p['name'],
                'championPrediction' => $db_p['champion_prediction'],
                'championPredictionText' => $db_p['champion_prediction_text'],
                'championPredictionId' => $db_p['champion_prediction_id'],
                'predictions' => isset($preds[$pId]) ? $preds[$pId] : new stdClass()
            ];
        }

        // Consultar resultados reales
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

        // Consultar nombres de equipos editados
        $matchTeams = new stdClass();
        $stmtTeam = $pdo->query("SELECT * FROM quiniela_match_teams");
        foreach ($stmtTeam->fetchAll() as $t) {
            $matchTeams->{$t['match_id']} = [
                'team1' => $t['team1'],
                'team2' => $t['team2']
            ];
        }

        // Consultar configs
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
        $pId = $data['player_id'];
        $mId = $data['match_id'];
        if (isset($data['delete']) && $data['delete']) {
            $stmt = $pdo->prepare("DELETE FROM quiniela_predictions WHERE player_id = :pId AND match_id = :mId");
            $stmt->execute(['pId' => $pId, 'mId' => $mId]);
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
        }
        write_api_log("Pronóstico guardado - Jugador: $pId, Partido: $mId, Marcador: " . ($data['goals1'] ?? 'N/A') . "-" . ($data['goals2'] ?? 'N/A') . " (unlocked: " . (isset($data['unlocked']) && $data['unlocked'] ? 'si' : 'no') . ")");
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
        $pId = $data['player_id'];
        $stmt = $pdo->prepare("UPDATE quiniela_players 
                               SET champion_prediction = :champ, champion_prediction_text = :txt, champion_prediction_id = :cid 
                               WHERE id = :pId");
        $stmt->execute([
            'pId' => $pId,
            'champ' => isset($data['championPrediction']) ? $data['championPrediction'] : null,
            'txt' => isset($data['championPredictionText']) ? $data['championPredictionText'] : null,
            'cid' => isset($data['championPredictionId']) ? $data['championPredictionId'] : null
        ]);
        write_api_log("Voto campeón guardado - Jugador: $pId, Selección: " . ($data['championPredictionText'] ?? 'N/A'));
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
    if ($data) {
        if (isset($data['match_id']) && $data['match_id'] === 'all' && isset($data['reset']) && $data['reset']) {
            $pdo->exec("DELETE FROM quiniela_real_results");
            write_api_log("ADMIN: Limpieza de TODOS los marcadores reales.");
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
            write_api_log("ADMIN: Resultado real guardado - Partido: " . $data['match_id'] . ", Marcador: " . ($data['goals1'] ?? 'N/A') . "-" . ($data['goals2'] ?? 'N/A') . ", Estado: " . ($data['status'] ?? 'N/A') . ", Has api_data: " . (isset($data['api_data']) ? 'yes' : 'no'));
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
        $stmt = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) 
                               VALUES (:mId, :t1, :t2) 
                               ON DUPLICATE KEY UPDATE team1 = :t1, team2 = :t2");
        $stmt->execute([
            'mId' => $data['match_id'],
            't1' => isset($data['team1']) ? $data['team1'] : null,
            't2' => isset($data['team2']) ? $data['team2'] : null
        ]);
        write_api_log("ADMIN: Equipos personalizados guardados - Partido: " . $data['match_id'] . ", Eq1: " . ($data['team1'] ?? 'N/A') . ", Eq2: " . ($data['team2'] ?? 'N/A'));
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
        $stmt = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) 
                               VALUES (:key, :val) 
                               ON DUPLICATE KEY UPDATE config_value = :val");
        foreach ($data as $k => $v) {
            if (is_bool($v)) {
                $v = $v ? '1' : '0';
            }
            $stmt->execute([
                'key' => $k,
                'val' => $v !== null ? strval($v) : null
            ]);
        }
        write_api_log("ADMIN: Configuración de puntos/sistema actualizada.");
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
        $stmt = $pdo->prepare("INSERT INTO quiniela_config (config_key, config_value) 
                               VALUES ('realChampion', :val) 
                               ON DUPLICATE KEY UPDATE config_value = :val");
        $stmt->execute(['val' => $data['realChampion']]);
        write_api_log("ADMIN: Campeón oficial guardado: " . $data['realChampion']);
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
        $stmt = $pdo->prepare("INSERT INTO quiniela_players (id, name) VALUES (:id, :name)");
        $stmt->execute([
            'id' => $data['id'],
            'name' => $data['name']
        ]);
        write_api_log("ADMIN: Jugador agregado - ID: " . $data['id'] . ", Nombre: " . $data['name']);
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
        $pId = $data['id'];
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("DELETE FROM quiniela_players WHERE id = :id");
            $stmt->execute(['id' => $pId]);
            $stmt = $pdo->prepare("DELETE FROM quiniela_predictions WHERE player_id = :id");
            $stmt->execute(['id' => $pId]);
            $pdo->commit();
            write_api_log("ADMIN: Jugador eliminado - ID: " . $pId);
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Id de jugador no especificado.']);
    }
    exit;
}

// 10. Endpoint REST: Restablecer Jugadores
if ($action === 'reset_players' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM quiniela_players");
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->commit();
        write_api_log("ADMIN: Se eliminaron TODOS los jugadores y sus pronósticos.");
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// 11. Endpoint REST: Restablecer Todo
if ($action === 'reset_all' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM quiniela_players");
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->exec("DELETE FROM quiniela_real_results");
        $pdo->exec("DELETE FROM quiniela_match_teams");
        $pdo->exec("DELETE FROM quiniela_config");
        $pdo->commit();
        write_api_log("ADMIN: Reinicio COMPLETO de todo el sistema de quiniela.");
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        $pdo->rollBack();
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

        // Real results
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
if ($action === 'import_state' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $state_json = json_decode($input, true);
    $res = importFullStateJSON($pdo, $state_json);
    echo json_encode($res);
    exit;
}

// 13. Endpoint de guardado original (retrocompatibilidad completa)
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $state_json = json_decode($input, true);
    if ($state_json === null) {
        echo json_encode(['status' => 'error', 'message' => 'JSON inválido en el cuerpo del save.']);
        exit;
    }
    // Ejecutar importación masiva estructurada
    $res = importFullStateJSON($pdo, $state_json);
    echo json_encode($res);
    exit;
}

// Acción desconocida
echo json_encode(['status' => 'error', 'message' => 'Acción no soportada.']);
