<?php
// respaldo.php
// Script de respaldo automático de base de datos MySQL de la Quiniela
// Puede ser ejecutado diariamente mediante una tarea Cron (ej. cPanel)

header('Content-Type: application/json; charset=utf-8');

// Configuración de la base de datos (reutilizando db_config.php si existe)
$config_file = __DIR__ . '/db_config.php';
$db_host = 'localhost';
$db_name = 'vsystemsv_ria';
$db_user = 'vsystemsv_ria';
$db_pass = 'Ria2026/*';

if (file_exists($config_file)) {
    include $config_file;
}

// Permitir ejecución solo desde CLI o con el token secreto idéntico al Cron
$is_cli = (php_sapi_name() === 'cli');
$secret_token = 'cron_secure_token_2026';

if (!$is_cli) {
    if (!isset($_GET['token']) || $_GET['token'] !== $secret_token) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['status' => 'error', 'message' => 'Acceso no autorizado.']);
        exit;
    }
}

function write_backup_log($message) {
    $log_file = __DIR__ . '/api_debug.log';
    $timestamp = date('Y-m-d H:i:s');
    @file_put_contents($log_file, "[$timestamp] [BACKUP] $message\n", FILE_APPEND);
}

// Conectar a la base de datos
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (PDOException $e) {
    write_backup_log("Error de conexión a la BD: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la BD: ' . $e->getMessage()]);
    exit;
}

try {
    // 1. Consultar configuración
    $config = [
        'pointsExact' => 3,
        'pointsWinner' => 1,
        'pointsClosest' => 1,
        'pointsChampion' => 10,
        'pointsPenalties' => 1,
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
            if ($k === 'pointsExact' || $k === 'pointsWinner' || $k === 'pointsClosest' || $k === 'pointsChampion' || $k === 'pointsPenalties') {
                $config[$k] = intval($v);
            } elseif ($k === 'championVotingClosed') {
                $config[$k] = (intval($v) === 1);
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
            'goals1' => isset($r['goals1']) && $r['goals1'] !== null ? intval($r['goals1']) : null,
            'goals2' => isset($r['goals2']) && $r['goals2'] !== null ? intval($r['goals2']) : null,
            'penalties1' => isset($r['penalties1']) && $r['penalties1'] !== null ? intval($r['penalties1']) : null,
            'penalties2' => isset($r['penalties2']) && $r['penalties2'] !== null ? intval($r['penalties2']) : null,
            'penalty_winner' => isset($r['penalty_winner']) && $r['penalty_winner'] !== null ? intval($r['penalty_winner']) : null,
            'status' => $r['status'],
            'api_data' => isset($r['api_data']) && $r['api_data'] !== null ? json_decode($r['api_data'], true) : null
        ];
    }

    // 3. Consultar nombres de equipos editados
    $matchTeams = new stdClass();
    $stmtTeams = $pdo->query("SELECT * FROM quiniela_match_teams");
    foreach ($stmtTeams->fetchAll() as $t) {
        $matchTeams->{$t['match_id']} = [
            'team1' => $t['team1'],
            'team2' => $t['team2']
        ];
    }

    // 4. Cargar matches.js
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
            'goals1' => isset($pr['goals1']) ? $pr['goals1'] : null,
            'goals2' => isset($pr['goals2']) ? $pr['goals2'] : null,
            'penalties1' => isset($pr['penalties1']) && $pr['penalties1'] !== null ? intval($pr['penalties1']) : null,
            'penalties2' => isset($pr['penalties2']) && $pr['penalties2'] !== null ? intval($pr['penalties2']) : null,
            'penalty_winner' => isset($pr['penalty_winner']) && $pr['penalty_winner'] !== null ? intval($pr['penalty_winner']) : null,
            'unlocked' => isset($pr['unlocked']) && intval($pr['unlocked']) === 1
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
                            $ptsPenaltiesCfg = isset($config['pointsPenalties']) ? intval($config['pointsPenalties']) : 1;

                            $matchObj = null;
                            foreach ($local_matches as $lm) {
                                if ($lm['id'] == $mId) {
                                    $matchObj = $lm;
                                    break;
                                }
                            }
                            $isKnockout = $matchObj && (!isset($matchObj['group']) || $matchObj['group'] === '');

                            if ($p1 === $r1 && $p2 === $r2) {
                                $pointsEarned = $ptsExactCfg + $ptsWinnerCfg;
                                if ($isKnockout && $r1 === $r2) {
                                    $realPWinner = null;
                                    if (isset($real['penalties1']) && isset($real['penalties2']) && $real['penalties1'] !== null && $real['penalties2'] !== null) {
                                        if (intval($real['penalties1']) > intval($real['penalties2'])) $realPWinner = 1;
                                        elseif (intval($real['penalties2']) > intval($real['penalties1'])) $realPWinner = 2;
                                    } elseif (isset($real['penalty_winner'])) {
                                        $realPWinner = intval($real['penalty_winner']);
                                    }

                                    $predPWinner = null;
                                    if (isset($pred['penalties1']) && isset($pred['penalties2']) && $pred['penalties1'] !== null && $pred['penalties2'] !== null) {
                                        if (intval($pred['penalties1']) > intval($pred['penalties2'])) $predPWinner = 1;
                                        elseif (intval($pred['penalties2']) > intval($pred['penalties1'])) $predPWinner = 2;
                                    } elseif (isset($pred['penalty_winner'])) {
                                        $predPWinner = intval($pred['penalty_winner']);
                                    }

                                    if ($realPWinner !== null && $predPWinner !== null && $realPWinner === $predPWinner) {
                                        $pointsEarned += $ptsPenaltiesCfg;
                                    }
                                }
                                $totalPoints += $pointsEarned;
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
                                
                                if ($isKnockout && $r1 === $r2 && $p1 === $p2) {
                                    $realPWinner = null;
                                    if (isset($real['penalties1']) && isset($real['penalties2']) && $real['penalties1'] !== null && $real['penalties2'] !== null) {
                                        if (intval($real['penalties1']) > intval($real['penalties2'])) $realPWinner = 1;
                                        elseif (intval($real['penalties2']) > intval($real['penalties1'])) $realPWinner = 2;
                                    } elseif (isset($real['penalty_winner'])) {
                                        $realPWinner = intval($real['penalty_winner']);
                                    }

                                    $predPWinner = null;
                                    if (isset($pred['penalties1']) && isset($pred['penalties2']) && $pred['penalties1'] !== null && $pred['penalties2'] !== null) {
                                        if (intval($pred['penalties1']) > intval($pred['penalties2'])) $predPWinner = 1;
                                        elseif (intval($pred['penalties2']) > intval($pred['penalties1'])) $predPWinner = 2;
                                    } elseif (isset($pred['penalty_winner'])) {
                                        $predPWinner = intval($pred['penalty_winner']);
                                    }

                                    if ($realPWinner !== null && $predPWinner !== null && $realPWinner === $predPWinner) {
                                        $pointsEarned += $ptsPenaltiesCfg;
                                    }
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
            'points' => $totalPoints,        // Para compatibilidad
            'totalPoints' => $totalPoints,   // Para compatibilidad
            'predictions' => (isset($preds[$pId]) && !empty($preds[$pId])) ? $preds[$pId] : new stdClass()
        ];
    }

    // Unificar el estado consolidado
    $state = [
        'players' => $players,
        'realResults' => $realResults,
        'matchTeams' => $matchTeams,
        'config' => $config,
        'realChampion' => $realChampion
    ];

    // Crear directorio de respaldos si no existe
    $backups_dir = __DIR__ . '/backups';
    if (!file_exists($backups_dir)) {
        mkdir($backups_dir, 0755, true);
    }

    // Guardar archivo JSON físico
    $timestamp_str = date('Y-m-d_H-i-s');
    $filename = "quiniela_backup_" . $timestamp_str . "_" . time() . ".json";
    $filepath = $backups_dir . '/' . $filename;
    
    $json_content = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (file_put_contents($filepath, $json_content) === false) {
        throw new Exception("No se pudo escribir el archivo de respaldo en el servidor.");
    }

    // Limpieza automática de respaldos antiguos (más de 30 días)
    $files = glob($backups_dir . '/quiniela_backup_*.json');
    $now = time();
    $deleted_count = 0;
    foreach ($files as $file) {
        if (is_file($file)) {
            if ($now - filemtime($file) > 30 * 24 * 60 * 60) {
                unlink($file);
                $deleted_count++;
            }
        }
    }

    $log_msg = "Respaldo generado con éxito: $filename (Jugadores: " . count($players) . ")";
    if ($deleted_count > 0) {
        $log_msg .= ". Se limpiaron $deleted_count respaldos obsoletos de más de 30 días.";
    }
    write_backup_log($log_msg);

    echo json_encode([
        'status' => 'success',
        'message' => 'Respaldo generado con éxito.',
        'file' => $filename,
        'path' => 'backups/' . $filename,
        'timestamp' => date('Y-m-d H:i:s'),
        'size_bytes' => filesize($filepath),
        'players_count' => count($players),
        'deleted_old_backups' => $deleted_count
    ]);

} catch (Exception $e) {
    write_backup_log("Error de ejecución de respaldo: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Error de ejecución de respaldo: ' . $e->getMessage()]);
    exit;
}
exit;
