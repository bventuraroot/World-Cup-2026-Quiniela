<?php
// cron.php
// Script de sincronización automática para cron job

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

// Permitir ejecución solo desde CLI o con un token secreto por seguridad
$is_cli = (php_sapi_name() === 'cli');
$secret_token = 'cron_secure_token_2026'; // Token de seguridad por defecto

if (!$is_cli) {
    if (!isset($_GET['token']) || $_GET['token'] !== $secret_token) {
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(['status' => 'error', 'message' => 'Acceso no autorizado.']);
        exit;
    }
}

function write_cron_log($message) {
    $log_file = __DIR__ . '/api_debug.log';
    $timestamp = date('Y-m-d H:i:s');
    @file_put_contents($log_file, "[$timestamp] [CRON] $message\n", FILE_APPEND);
}

// Conectar a la base de datos
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    write_cron_log("Error de conexión a la BD: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la BD: ' . $e->getMessage()]);
    exit;
}

// Función portátil para remover acentos y tildes
function removeAccents($str) {
    return str_replace(
        ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ', 'ç', 'Ç', 'ã', 'õ', 'â', 'ê', 'î', 'ô', 'û'],
        ['a', 'e', 'i', 'o', 'u', 'n', 'a', 'e', 'i', 'o', 'u', 'n', 'c', 'c', 'a', 'o', 'a', 'e', 'i', 'o', 'u'],
        $str
    );
}

// Función de normalización de nombres (idéntica a la versión Javascript)
function normalizeTeamName($name) {
    if (!$name) return "";
    $n = removeAccents($name);
    $n = trim(strtolower($n));
    
    if ($n === "united states" || $n === "usa" || $n === "us") return "usa";
    if ($n === "bosnia-herzegovina" || $n === "bosnia and herzegovina" || $n === "bosnia & herzegovina") return "bosnia & herzegovina";
    if ($n === "korea republic" || $n === "south korea" || $n === "korea, republic of") return "south korea";
    if ($n === "czechia" || $n === "czech republic") return "czech republic";
    if ($n === "ivory coast" || $n === "cote d'ivoire" || $n === "cote divoire") return "ivory coast";
    if ($n === "turkiye" || $n === "turquia" || $n === "turkey") return "turkey";
    if ($n === "saudi arabia" || $n === "arabia saudita") return "saudi arabia";
    if ($n === "congo dr" || $n === "dr congo") return "dr congo";
    
    return $n;
}

// Helper para convertir fecha de matches.js a timestamp UTC
function getMatchUtcTime($dateStr, $timeStr) {
    preg_match('/(\d{2}):(\d{2})\s+UTC([+-]\d+)/', $timeStr, $matches);
    if (!$matches) {
        return strtotime($dateStr . ' ' . explode(' ', $timeStr)[0] . ' UTC');
    }
    
    $hours = intval($matches[1]);
    $minutes = intval($matches[2]);
    $offset = intval($matches[3]);
    
    $dt = new DateTime($dateStr . ' ' . $matches[1] . ':' . $matches[2] . ':00', new DateTimeZone('UTC'));
    if ($offset < 0) {
        $dt->add(new DateInterval('PT' . abs($offset) . 'H'));
    } else {
        $dt->sub(new DateInterval('PT' . abs($offset) . 'H'));
    }
    return $dt->getTimestamp();
}

// Helper para obtener nombres de equipos considerando ediciones manuales del admin
// (ya que en eliminatorias pueden estar guardados en quiniela_match_teams)
$custom_teams = [];
try {
    $stmt = $pdo->query("SELECT match_id, team1, team2 FROM quiniela_match_teams");
    while ($row = $stmt->fetch()) {
        $custom_teams[$row['match_id']] = [
            'team1' => $row['team1'],
            'team2' => $row['team2']
        ];
    }
} catch (PDOException $e) {
    write_cron_log("Error cargando equipos personalizados: " . $e->getMessage());
}

function getTeamName($matchId, $teamNum, $defaultName, $custom_teams) {
    if (isset($custom_teams[$matchId])) {
        $customName = $teamNum === 1 ? $custom_teams[$matchId]['team1'] : $custom_teams[$matchId]['team2'];
        if ($customName !== null && trim($customName) !== "") {
            return trim($customName);
        }
    }
    return $defaultName;
}

// 1. Cargar matches.js
$matches_file = __DIR__ . '/matches.js';
if (!file_exists($matches_file)) {
    write_cron_log("Error: No se encontró matches.js.");
    echo json_encode(['status' => 'error', 'message' => 'No se encontró matches.js']);
    exit;
}

$js_content = file_get_contents($matches_file);
$start_pos = strpos($js_content, '[');
$end_pos = strrpos($js_content, ']') + 1;
if ($start_pos === false || $end_pos === false) {
    write_cron_log("Error: Formato inválido en matches.js.");
    echo json_encode(['status' => 'error', 'message' => 'Formato inválido en matches.js']);
    exit;
}
$json_str = substr($js_content, $start_pos, $end_pos - $start_pos);
$local_matches = json_decode($json_str, true);

if (!$local_matches) {
    write_cron_log("Error de parseo JSON de matches.js.");
    echo json_encode(['status' => 'error', 'message' => 'Error de parseo JSON de matches.js']);
    exit;
}

// 2. Cargar marcadores actuales de la BD para comparar y no re-escribir innecesariamente
$current_real_results = [];
try {
    $stmt = $pdo->query("SELECT match_id, goals1, goals2, status, api_data FROM quiniela_real_results");
    while ($row = $stmt->fetch()) {
        $current_real_results[$row['match_id']] = [
            'goals1' => $row['goals1'] !== null ? intval($row['goals1']) : null,
            'goals2' => $row['goals2'] !== null ? intval($row['goals2']) : null,
            'status' => $row['status'],
            'api_data' => $row['api_data']
        ];
    }
} catch (PDOException $e) {
    write_cron_log("Error cargando resultados existentes: " . $e->getMessage());
}

// 3. Consultar la API de ESPN
$espn_url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260725';
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $espn_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200 || !$response) {
    write_cron_log("Error: No se pudo conectar con la API de ESPN (Código HTTP: $http_code).");
    echo json_encode(['status' => 'error', 'message' => 'Error al consultar ESPN API (HTTP Code: ' . $http_code . ')']);
    exit;
}

$espn_data = json_decode($response, true);
$events = isset($espn_data['events']) ? $espn_data['events'] : [];

if (empty($events)) {
    write_cron_log("Error: ESPN retornó cero eventos.");
    echo json_encode(['status' => 'error', 'message' => 'Cero eventos de ESPN']);
    exit;
}

$updated_results = 0;
$updated_teams = 0;

// Preparar declaraciones SQL
$stmt_save_result = $pdo->prepare("INSERT INTO quiniela_real_results (match_id, goals1, goals2, status, api_data) 
                                   VALUES (:mId, :g1, :g2, :status, :apiData) 
                                   ON DUPLICATE KEY UPDATE goals1 = :g1, goals2 = :g2, status = :status, api_data = :apiData");

$stmt_save_team = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) 
                                 VALUES (:mId, :t1, :t2) 
                                 ON DUPLICATE KEY UPDATE team1 = :t1, team2 = :t2");

foreach ($events as $event) {
    if (!isset($event['competitions'][0])) continue;
    $comps = $event['competitions'][0];
    $competitors = isset($comps['competitors']) ? $comps['competitors'] : [];
    if (count($competitors) < 2) continue;
    
    // Identificar local y visitante
    $homeComp = null;
    $awayComp = null;
    foreach ($competitors as $c) {
        if (isset($c['homeAway']) && $c['homeAway'] === 'home') {
            $homeComp = $c;
        } elseif (isset($c['homeAway']) && $c['homeAway'] === 'away') {
            $awayComp = $c;
        }
    }
    if (!$homeComp) $homeComp = $competitors[0];
    if (!$awayComp) $awayComp = $competitors[1];
    
    $espnHomeTeam = $homeComp['team']['displayName'];
    $espnAwayTeam = $awayComp['team']['displayName'];
    
    $espnHomeScore = isset($homeComp['score']) ? $homeComp['score'] : null;
    $espnAwayScore = isset($awayComp['score']) ? $awayComp['score'] : null;
    
    $espnState = isset($event['status']['type']['state']) ? $event['status']['type']['state'] : 'pre';
    $espnCompleted = isset($event['status']['type']['completed']) ? $event['status']['type']['completed'] : false;
    
    $goals1 = null;
    $goals2 = null;
    $status = 'scheduled';
    
    if ($espnState === 'in') {
        $status = 'live';
        $goals1 = intval($espnHomeScore);
        $goals2 = intval($espnAwayScore);
    } elseif ($espnState === 'post' || $espnCompleted === true) {
        $status = 'finished';
        $goals1 = intval($espnHomeScore);
        $goals2 = intval($espnAwayScore);
    }
    
    // Mapear al partido local correspondiente
    $localMatch = null;
    $reversed = false;
    
    $normHome = normalizeTeamName($espnHomeTeam);
    $normAway = normalizeTeamName($espnAwayTeam);
    
    // 1. Coincidir por nombre en grupos
    foreach ($local_matches as $m) {
        $isGroup = isset($m['group']) && strpos($m['group'], 'Group') === 0;
        if (!$isGroup) continue;
        
        $locT1 = normalizeTeamName($m['team1']);
        $locT2 = normalizeTeamName($m['team2']);
        
        if ($locT1 === $normHome && $locT2 === $normAway) {
            $localMatch = $m;
            break;
        }
        if ($locT1 === $normAway && $locT2 === $normHome) {
            $localMatch = $m;
            $reversed = true;
            break;
        }
    }
    
    // 2. Coincidir por fecha/hora en eliminatorias
    if (!$localMatch) {
        $espnUtcTime = strtotime($event['date']);
        foreach ($local_matches as $m) {
            $localUtcTime = getMatchUtcTime($m['date'], $m['time']);
            if (abs($espnUtcTime - $localUtcTime) < 60) { // Tolerancia de 60 segundos
                $localMatch = $m;
                break;
            }
        }
        
        if ($localMatch) {
            // Actualizar nombres de equipos de llaves si difieren
            $currentT1 = getTeamName($localMatch['id'], 1, $localMatch['team1'], $custom_teams);
            $currentT2 = getTeamName($localMatch['id'], 2, $localMatch['team2'], $custom_teams);
            
            if ($currentT1 !== $espnHomeTeam || $currentT2 !== $espnAwayTeam) {
                $stmt_save_team->execute([
                    'mId' => $localMatch['id'],
                    't1' => $espnHomeTeam,
                    't2' => $espnAwayTeam
                ]);
                $updated_teams++;
                write_cron_log("Equipos de llaves actualizados: Partido ID {$localMatch['id']} -> $espnHomeTeam vs $espnAwayTeam");
            }
        }
    }
    
    if ($localMatch) {
        $finalGoals1 = $reversed ? $goals2 : $goals1;
        $finalGoals2 = $reversed ? $goals1 : $goals2;
        
        $mId = $localMatch['id'];
        
        // --- EXTRAER DATOS ENRIQUECIDOS ---
        $espnVenue = isset($comps['venue']['fullName']) ? $comps['venue']['fullName'] : null;
        
        $espnBroadcasts = [];
        if (isset($comps['broadcasts'])) {
            foreach ($comps['broadcasts'] as $b) {
                if (isset($b['names'])) {
                    foreach ($b['names'] as $name) {
                        if (!in_array($name, $espnBroadcasts)) {
                            $espnBroadcasts[] = $name;
                        }
                    }
                }
            }
        }
        
        $espnDisplayClock = isset($event['status']['displayClock']) ? $event['status']['displayClock'] : null;
        
        $scorers = ['home' => [], 'away' => []];
        $red_cards = ['home' => [], 'away' => []];
        
        if (isset($comps['details'])) {
            foreach ($comps['details'] as $det) {
                $isGoal = isset($det['type']['text']) && (strpos(strtolower($det['type']['text']), 'goal') !== false);
                $isRedCard = isset($det['redCard']) && $det['redCard'] === true;
                
                if (!$isGoal && !$isRedCard && isset($det['type']['text'])) {
                    $typeText = strtolower($det['type']['text']);
                    if (strpos($typeText, 'red card') !== false) {
                        $isRedCard = true;
                    }
                }
                
                if ($isGoal || $isRedCard) {
                    $teamId = isset($det['team']['id']) ? $det['team']['id'] : null;
                    $minute = isset($det['clock']['displayValue']) ? $det['clock']['displayValue'] : '';
                    
                    $player = '';
                    if (isset($det['athletesInvolved'][0]['displayName'])) {
                        $player = $det['athletesInvolved'][0]['displayName'];
                    } elseif (isset($det['athletesInvolved'][0]['shortName'])) {
                        $player = $det['athletesInvolved'][0]['shortName'];
                    }
                    
                    if ($teamId !== null) {
                        $side = ($teamId == $homeComp['team']['id']) ? 'home' : 'away';
                        if ($reversed) {
                            $side = ($side === 'home') ? 'away' : 'home';
                        }
                        
                        if ($isGoal) {
                            $scorers[$side][] = [
                                'player' => $player,
                                'minute' => $minute
                            ];
                        } else {
                            $red_cards[$side][] = [
                                'player' => $player,
                                'minute' => $minute
                            ];
                        }
                    }
                }
            }
        }
        
        $api_data = [
            'venue' => $espnVenue,
            'broadcasts' => $espnBroadcasts,
            'clock' => $espnDisplayClock,
            'scorers' => $scorers,
            'red_cards' => $red_cards
        ];
        
        $api_data_json = json_encode($api_data, JSON_UNESCAPED_UNICODE);
        
        $hasChanged = false;
        
        if (!isset($current_real_results[$mId])) {
            $hasChanged = true;
        } else {
            $curr = $current_real_results[$mId];
            if ($curr['goals1'] !== $finalGoals1 || $curr['goals2'] !== $finalGoals2 || $curr['status'] !== $status || $curr['api_data'] !== $api_data_json) {
                $hasChanged = true;
            }
        }
        
        if ($hasChanged) {
            $stmt_save_result->execute([
                'mId' => $mId,
                'g1' => $finalGoals1,
                'g2' => $finalGoals2,
                'status' => $status,
                'apiData' => $api_data_json
            ]);
            $updated_results++;
            write_cron_log("Marcador actualizado (Enriquecido): Partido ID $mId -> " . ($finalGoals1 ?? 'N/A') . " - " . ($finalGoals2 ?? 'N/A') . " (Estado: $status)");
        }
    }
}

if ($updated_results > 0 || $updated_teams > 0) {
    $msg = "Sincronización automática completa. Resultados actualizados: $updated_results. Llaves de eliminatoria definidas: $updated_teams.";
    write_cron_log($msg);
    echo json_encode(['status' => 'success', 'message' => $msg]);
} else {
    echo json_encode(['status' => 'success', 'message' => 'Sincronización completa. Todo al día.']);
}
exit;
