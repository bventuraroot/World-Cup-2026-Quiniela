<?php
session_start();
header('Content-Type: text/html; charset=utf-8');

$log_file = __DIR__ . '/api_debug.log';
$config_file = __DIR__ . '/db_config.php';

// Cargar credenciales por defecto (igual que en api.php)
$db_host = 'localhost';
$db_name = 'vsystemsv_ria';
$db_user = 'vsystemsv_ria';
$db_pass = 'Ria2026/*';

if (file_exists($config_file)) {
    include $config_file;
}

// Intentar conexión a la base de datos
$connected = false;
$conn_error = '';
$pdo = null;
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
    $connected = true;
} catch (PDOException $e) {
    $conn_error = $e->getMessage();
}

// Obtener PIN de Administrador (valor por defecto 1234 si falla o está vacío)
$admin_pin = '1234';
if ($connected) {
    try {
        $stmt = $pdo->prepare("SELECT config_value FROM quiniela_config WHERE config_key = 'admin_pin'");
        $stmt->execute();
        $db_pin = $stmt->fetchColumn();
        if ($db_pin) {
            $admin_pin = $db_pin;
        }
    } catch (PDOException $e) {
        // Ignorar error y usar fallback
    }
}

// Lista oficial predefinida de 12 jugadores de la base de datos como fuente de verdad absoluta
$default_players = [
    '1781051130474' => 'Brian Ventura',
    '1781051800815' => 'Eduardo Mata',
    '1781051937433' => 'Sussy Escobar',
    '1781052521483' => 'Elsa Milla',
    '1781052534647' => 'Mario Estrada',
    '1781052553597' => 'Karla Reyes',
    '1781052568919' => 'Hector Garcia',
    '1781052600345' => 'JC Andreu',
    '1781052620631' => 'Carlos Cardoza',
    '1781052640891' => 'Raquel Mejia',
    '1781052648683' => 'Walter Campos',
    '1781053224616' => 'Jorge Varela'
];

// Obtener jugadores ya registrados en la base de datos (clave prefijada para evitar overflow 32-bit)
$existing_players = [];
if ($connected) {
    try {
        $stmt = $pdo->query("SELECT id, name, champion_prediction, champion_prediction_text, champion_prediction_id FROM quiniela_players");
        while ($row = $stmt->fetch()) {
            $key = 'p_' . $row['id'];
            $existing_players[$key] = $row;
        }
    } catch (PDOException $e) {
        // Ignorar si la tabla no existe o está vacía
    }
}

// Obtener predicciones ya registradas en la base de datos
$existing_predictions = [];
if ($connected) {
    try {
        $stmt = $pdo->query("SELECT player_id, match_id, goals1, goals2, unlocked FROM quiniela_predictions");
        while ($row = $stmt->fetch()) {
            $key = 'p_' . $row['player_id'];
            $existing_predictions[$key][$row['match_id']] = [
                'goals1' => $row['goals1'],
                'goals2' => $row['goals2'],
                'unlocked' => $row['unlocked']
            ];
        }
    } catch (PDOException $e) {
        // Ignorar si la tabla no existe o está vacía
    }
}

// Cerrar sesión
if (isset($_GET['logout'])) {
    unset($_SESSION['log_recovered_auth']);
    header('Location: recuperar_logs.php');
    exit;
}

// Manejar autenticación
$auth_error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pin'])) {
    if ($_POST['pin'] === $admin_pin) {
        $_SESSION['log_recovered_auth'] = true;
        header('Location: recuperar_logs.php');
        exit;
    } else {
        $auth_error = 'El PIN ingresado es incorrecto.';
    }
}

$is_authenticated = isset($_SESSION['log_recovered_auth']) && $_SESSION['log_recovered_auth'] === true;

// Inicializar contenedores de datos reconstruidos pre-cargados
$players = [];

// 1. Cargar la lista predefinida oficial
foreach ($default_players as $id => $name) {
    $key = 'p_' . $id;
    $players[$key] = [
        'id' => $id,
        'name' => $name,
        'champion_prediction' => null,
        'champion_prediction_text' => null,
        'champion_prediction_id' => null,
        'auto_created' => false,
        'source' => 'official'
    ];
}

// 2. Fusionar con los datos actuales de la Base de Datos (sobrescribe/añade)
foreach ($existing_players as $key => $row) {
    $players[$key] = [
        'id' => $row['id'],
        'name' => $row['name'],
        'champion_prediction' => $row['champion_prediction'],
        'champion_prediction_text' => $row['champion_prediction_text'],
        'champion_prediction_id' => $row['champion_prediction_id'],
        'auto_created' => false,
        'source' => 'db'
    ];
}

$predictions = [];
foreach ($existing_predictions as $key => $preds) {
    $predictions[$key] = $preds;
}

$match_teams = [];
$real_results = [];
$total_lines_processed = 0;
$log_found = file_exists($log_file);

if ($log_found) {
    $file_handle = fopen($log_file, 'r');
    if ($file_handle) {
        while (($line = fgets($file_handle)) !== false) {
            $total_lines_processed++;
            $line = trim($line);
            
            // 1. Jugador Agregado
            if (preg_match('/ADMIN: Jugador agregado - ID: (\d+), Nombre: (.+)/', $line, $matches)) {
                $id = $matches[1];
                $key = 'p_' . $id;
                
                // Conservar nombre oficial/BD si ya está cargado
                $name = isset($players[$key]) ? $players[$key]['name'] : trim($matches[2]);
                
                $players[$key] = [
                    'id' => $id,
                    'name' => $name,
                    'champion_prediction' => isset($players[$key]) ? $players[$key]['champion_prediction'] : null,
                    'champion_prediction_text' => isset($players[$key]) ? $players[$key]['champion_prediction_text'] : null,
                    'champion_prediction_id' => isset($players[$key]) ? $players[$key]['champion_prediction_id'] : null,
                    'auto_created' => false,
                    'source' => 'log'
                ];
            }
            // 2. Jugador Eliminado
            elseif (preg_match('/ADMIN: Jugador eliminado - ID: (\d+)/', $line, $matches)) {
                $id = $matches[1];
                $key = 'p_' . $id;
                // No eliminar si es parte de la lista predefinida oficial o de la base de datos
                if (!isset($default_players[$id]) && !isset($existing_players[$key])) {
                    unset($players[$key]);
                    unset($predictions[$key]);
                }
            }
            // 3. Pronóstico Guardado
            elseif (preg_match('/Pronóstico guardado - Jugador: (\d+), Partido: (\w+), Marcador: ([0-9]*|N\/A)-([0-9]*|N\/A)/', $line, $matches)) {
                $pId = $matches[1];
                $key = 'p_' . $pId;
                $mId = $matches[2];
                $g1 = ($matches[3] === 'N/A' || $matches[3] === '') ? null : $matches[3];
                $g2 = ($matches[4] === 'N/A' || $matches[4] === '') ? null : $matches[4];
                
                // Determinar si estaba desbloqueado
                $unlocked = 0;
                if (strpos($line, 'unlocked: si') !== false) {
                    $unlocked = 1;
                }
                
                // Auto-crear jugador si no existe explícitamente en el log, BD o lista oficial
                if (!isset($players[$key])) {
                    $players[$key] = [
                        'id' => $pId,
                        'name' => "Jugador " . substr($pId, -4),
                        'champion_prediction' => null,
                        'champion_prediction_text' => null,
                        'champion_prediction_id' => null,
                        'auto_created' => true,
                        'source' => 'log_prediction'
                    ];
                }
                
                $predictions[$key][$mId] = [
                    'goals1' => $g1,
                    'goals2' => $g2,
                    'unlocked' => $unlocked
                ];
            }
            // 4. Voto Campeón Guardado
            elseif (preg_match('/Voto campeón guardado - Jugador: (\d+), Selección: (.+)/', $line, $matches)) {
                $pId = $matches[1];
                $key = 'p_' . $pId;
                $sel = trim($matches[2]);
                
                // Auto-crear jugador si no existe explícitamente en el log, BD o lista oficial
                if (!isset($players[$key])) {
                    $players[$key] = [
                        'id' => $pId,
                        'name' => "Jugador " . substr($pId, -4),
                        'champion_prediction' => null,
                        'champion_prediction_text' => null,
                        'champion_prediction_id' => null,
                        'auto_created' => true,
                        'source' => 'log_prediction'
                    ];
                }
                
                $players[$key]['champion_prediction'] = $sel;
                $players[$key]['champion_prediction_text'] = $sel;
                $players[$key]['champion_prediction_id'] = $sel;
            }
            // 5. Equipos Personalizados Guardados (Fases de eliminación)
            elseif (preg_match('/ADMIN: Equipos personalizados guardados - Partido: (\w+), Eq1: (.+?), Eq2: (.+)/', $line, $matches)) {
                $mId = $matches[1];
                $eq1 = trim($matches[2]);
                $eq2 = trim($matches[3]);
                $match_teams[$mId] = [
                    'team1' => $eq1,
                    'team2' => $eq2
                ];
            }
            // 6. Resultado Real Guardado (Marcadores reales del torneo)
            elseif (preg_match('/ADMIN: Resultado real guardado - Partido: (\w+), Marcador: ([0-9]*|N\/A)-([0-9]*|N\/A), Estado: ([a-zA-Z0-9_-]+)/', $line, $matches)) {
                $mId = $matches[1];
                $g1 = ($matches[2] === 'N/A' || $matches[2] === '') ? null : intval($matches[2]);
                $g2 = ($matches[3] === 'N/A' || $matches[3] === '') ? null : intval($matches[3]);
                $status = $matches[4];
                $real_results[$mId] = [
                    'goals1' => $g1,
                    'goals2' => $g2,
                    'status' => $status
                ];
            }
            // 7. Sincronizaciones automáticas de llaves por CRON
            elseif (preg_match('/\[CRON\] Equipos de llaves actualizados: Partido ID (\w+) -> (.+?) vs (.+)/', $line, $matches)) {
                $mId = $matches[1];
                $eq1 = trim($matches[2]);
                $eq2 = trim($matches[3]);
                $match_teams[$mId] = [
                    'team1' => $eq1,
                    'team2' => $eq2
                ];
            }
        }
        fclose($file_handle);
    }
}

// Cruzar con los nombres ya existentes en la Base de Datos para no forzar a re-escribirlos
if (!empty($existing_players)) {
    foreach ($players as $key => &$p) {
        if (isset($existing_players[$key]) && trim($existing_players[$key]['name']) !== '') {
            $p['name'] = trim($existing_players[$key]['name']);
            $p['auto_created'] = false; // Ya no cuenta como auto_created genérico, es un jugador existente real
            if ($p['source'] === 'log_prediction' || $p['source'] === 'official') {
                $p['source'] = 'db'; // Actualizar origen a BD si proviene de ella
            }
        }
    }
}

// Buscar en logs si se solicita
$search_query = isset($_GET['search']) ? trim($_GET['search']) : '';
$search_results = [];
if ($search_query !== '' && $log_found) {
    $file_handle = fopen($log_file, 'r');
    if ($file_handle) {
        $line_num = 0;
        while (($line = fgets($file_handle)) !== false) {
            $line_num++;
            if (stripos($line, $search_query) !== false) {
                $search_results[] = [
                    'line' => $line_num,
                    'content' => trim($line)
                ];
            }
        }
        fclose($file_handle);
    }
}

// Ejecutar Restauración Real en la Base de Datos
$restore_success = false;
$restore_error = '';
if ($is_authenticated && isset($_POST['action']) && $_POST['action'] === 'restore' && $connected) {
    try {
        $pdo->beginTransaction();
        
        // 1. Limpiar jugadores y predicciones actuales
        $pdo->exec("DELETE FROM quiniela_predictions");
        $pdo->exec("DELETE FROM quiniela_players");
        
        // 2. Insertar jugadores reconstruidos (usando nombres editados si se enviaron)
        $stmtPlayer = $pdo->prepare("INSERT INTO quiniela_players (id, name, champion_prediction, champion_prediction_text, champion_prediction_id) 
                                    VALUES (:id, :name, :champ, :champ_txt, :champ_id)
                                    ON DUPLICATE KEY UPDATE name = :name, champion_prediction = :champ, champion_prediction_text = :champ_txt, champion_prediction_id = :champ_id");
        
        $inserted_ids = [];
        foreach ($players as $p) {
            $pId = $p['id'];
            
            // Evitar duplicados exactos si PHP realiza conversiones extrañas de tipos
            if (in_array($pId, $inserted_ids)) {
                continue;
            }
            $inserted_ids[] = $pId;
            
            $name = isset($_POST['player_names'][$pId]) ? trim($_POST['player_names'][$pId]) : '';
            if ($name === '') {
                $name = $p['name'];
            }
            $stmtPlayer->execute([
                'id' => $pId,
                'name' => $name,
                'champ' => $p['champion_prediction'],
                'champ_txt' => $p['champion_prediction_text'],
                'champ_id' => $p['champion_prediction_id']
            ]);
        }
        
        // 3. Insertar predicciones reconstruidas
        $stmtPred = $pdo->prepare("INSERT INTO quiniela_predictions (player_id, match_id, goals1, goals2, unlocked) 
                                  VALUES (:player_id, :match_id, :goals1, :goals2, :unlocked)
                                  ON DUPLICATE KEY UPDATE goals1 = :goals1, goals2 = :goals2, unlocked = :unlocked");
        foreach ($predictions as $key => $preds) {
            // Extraer ID real numérico a partir del key con prefijo 'p_'
            $pId = substr($key, 2);
            foreach ($preds as $mId => $pred) {
                $stmtPred->execute([
                    'player_id' => $pId,
                    'match_id' => $mId,
                    'goals1' => $pred['goals1'],
                    'goals2' => $pred['goals2'],
                    'unlocked' => $pred['unlocked']
                ]);
            }
        }
        
        // 4. Actualizar equipos personalizados (sin borrar para no pisar otros partidos no modificados)
        $stmtTeam = $pdo->prepare("INSERT INTO quiniela_match_teams (match_id, team1, team2) 
                                  VALUES (:match_id, :team1, :team2) 
                                  ON DUPLICATE KEY UPDATE team1 = :team1, team2 = :team2");
        foreach ($match_teams as $mId => $mt) {
            $stmtTeam->execute([
                'match_id' => $mId,
                'team1' => $mt['team1'],
                'team2' => $mt['team2']
            ]);
        }
        
        // 5. Actualizar resultados reales oficiales
        $stmtResult = $pdo->prepare("INSERT INTO quiniela_real_results (match_id, goals1, goals2, status) 
                                    VALUES (:match_id, :goals1, :goals2, :status) 
                                    ON DUPLICATE KEY UPDATE goals1 = :goals1, goals2 = :goals2, status = :status");
        foreach ($real_results as $mId => $rr) {
            $stmtResult->execute([
                'match_id' => $mId,
                'goals1' => $rr['goals1'],
                'goals2' => $rr['goals2'],
                'status' => $rr['status']
            ]);
        }
        
        $pdo->commit();
        $restore_success = true;
        
        // Registrar la restauración exitosa en el propio log
        $timestamp = date('Y-m-d H:i:s');
        @file_put_contents($log_file, "[$timestamp] ADMIN: RESTAURACIÓN COMPLETA DE BASE DE DATOS exitosa desde script recuperar_logs.php.\n", FILE_APPEND);
        
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $restore_error = $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restaurador de Logs - Quiniela Mundial 2026</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --surface-color: rgba(20, 26, 46, 0.7);
      --surface-solid: #131a30;
      --surface-hover: #1e294b;
      --border-color: rgba(255, 255, 255, 0.08);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --primary: #10b981;
      --primary-glow: rgba(16, 185, 129, 0.2);
      --secondary: #fbbf24;
      --danger: #f43f5e;
      --info: #0ea5e9;
      --border-radius-md: 14px;
      --border-radius-lg: 20px;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      line-height: 1.5;
      padding: 2rem 1rem;
      position: relative;
      overflow-x: hidden;
    }
    
    .bg-glow {
      position: absolute;
      top: -10%;
      right: -10%;
      width: 50vw;
      height: 50vh;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(0,0,0,0) 70%);
      filter: blur(80px);
      z-index: -1;
      pointer-events: none;
    }

    .bg-glow-2 {
      position: absolute;
      bottom: -10%;
      left: -10%;
      width: 50vw;
      height: 50vh;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, rgba(0,0,0,0) 70%);
      filter: blur(80px);
      z-index: -1;
      pointer-events: none;
    }
    
    .container {
      width: 100%;
      max-width: 850px;
      background-color: var(--surface-color);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-lg);
      padding: 2.5rem;
      box-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.5);
    }
    
    h1 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f8fafc 30%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-align: center;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 1rem;
      margin-bottom: 2rem;
      text-align: center;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }
    
    .status-success {
      background: rgba(16, 185, 129, 0.1);
      color: var(--primary);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    
    .status-danger {
      background: rgba(244, 63, 94, 0.1);
      color: var(--danger);
      border: 1px solid rgba(244, 63, 94, 0.25);
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    input[type="password"] {
      width: 100%;
      padding: 0.8rem 1rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md);
      color: var(--text-primary);
      font-size: 1.1rem;
      text-align: center;
      letter-spacing: 0.3em;
      transition: all 0.2s;
    }
    
    input[type="password"]:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 10px var(--primary-glow);
    }
    
    .btn {
      display: block;
      width: 100%;
      padding: 0.9rem;
      background: linear-gradient(135deg, var(--primary) 0%, #059669 100%);
      border: none;
      border-radius: var(--border-radius-md);
      color: #ffffff;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s, opacity 0.15s;
    }
    
    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 0 15px var(--primary-glow);
    }
    
    .btn:active {
      transform: translateY(0);
    }
    
    .btn-secondary {
      background: var(--surface-solid);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      margin-top: 1rem;
    }
    
    .btn-secondary:hover {
      background: var(--surface-hover);
      transform: translateY(-2px);
    }
    
    .alert {
      padding: 1rem 1.25rem;
      border-radius: var(--border-radius-md);
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }
    
    .alert-danger {
      background: rgba(244, 63, 94, 0.1);
      border: 1px solid rgba(244, 63, 94, 0.2);
      color: var(--danger);
    }

    .alert-warning {
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.2);
      color: var(--secondary);
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: var(--primary);
      text-align: center;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: var(--surface-solid);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md);
      padding: 1.25rem;
      text-align: center;
    }
    
    .summary-number {
      font-family: 'Outfit', sans-serif;
      font-size: 2rem;
      font-weight: 800;
      color: var(--primary);
      margin-bottom: 0.25rem;
    }
    
    .summary-label {
      color: var(--text-secondary);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .preview-table-container {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md);
      margin-bottom: 2rem;
      scrollbar-width: thin;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    
    th, td {
      padding: 0.75rem 1rem;
      font-size: 0.9rem;
      vertical-align: middle;
    }
    
    th {
      background: var(--surface-solid);
      color: var(--text-secondary);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--border-color);
    }
    
    tr:not(:last-child) {
      border-bottom: 1px solid var(--border-color);
    }
    
    tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    
    .nav-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border-color);
    }

    .nav-user {
      font-weight: 600;
      color: var(--text-primary);
    }

    .logout-link {
      color: var(--danger);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      border: 1px solid rgba(244, 63, 94, 0.2);
      transition: all 0.2s;
    }
    
    .logout-link:hover {
      background: rgba(244, 63, 94, 0.1);
    }

    /* Estilo del input del nombre editable */
    .player-name-field {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: #ffffff;
      padding: 0.4rem 0.6rem;
      font-family: inherit;
      font-size: 0.9rem;
      width: 100%;
      max-width: 250px;
      transition: all 0.2s;
    }
    
    .player-name-field:focus {
      outline: none;
      border-color: var(--primary);
      background: rgba(15, 23, 42, 0.7);
    }

    .badge-auto {
      background: rgba(251, 191, 36, 0.1);
      color: var(--secondary);
      border: 1px solid rgba(251, 191, 36, 0.25);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      margin-left: 0.5rem;
      display: inline-block;
    }

    .badge-db {
      background: rgba(14, 165, 233, 0.1);
      color: var(--info);
      border: 1px solid rgba(14, 165, 233, 0.25);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      margin-left: 0.5rem;
      display: inline-block;
    }

    .badge-log {
      background: rgba(16, 185, 129, 0.1);
      color: var(--primary);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      margin-left: 0.5rem;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="bg-glow-2"></div>
  
  <div class="container">
    <h1>Restauración de Datos</h1>
    <div class="subtitle">Herramienta de Recuperación mediante Logs del Servidor</div>
    
    <!-- Estado de la base de datos -->
    <div style="text-align: center;">
      <?php if ($connected): ?>
        <span class="status-badge status-success">● Base de Datos Conectada</span>
      <?php else: ?>
        <span class="status-badge status-danger">● Desconectado de BD: <?php echo htmlspecialchars($conn_error); ?></span>
      <?php endif; ?>
    </div>
    
    <?php if (!$is_authenticated): ?>
      <!-- Formulario de Inicio de Sesión / PIN -->
      <form method="POST" style="max-width: 400px; margin: 0 auto;">
        <div class="alert alert-warning" style="text-align: center;">
          Se requiere autenticación para acceder a esta herramienta de administración.
        </div>
        
        <?php if ($auth_error): ?>
          <div class="alert alert-danger"><?php echo htmlspecialchars($auth_error); ?></div>
        <?php endif; ?>
        
        <div class="form-group">
          <label for="pin">PIN de Administrador de la Quiniela</label>
          <input type="password" name="pin" id="pin" maxlength="10" placeholder="••••" required autofocus autocomplete="off">
        </div>
        
        <button type="submit" class="btn">Acceder al Restaurador</button>
      </form>
      
    <?php elseif ($restore_success): ?>
      <!-- Restauración Exitosa -->
      <div class="alert alert-success" style="padding: 2.5rem 1.5rem; margin-bottom: 2rem;">
        <h2 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.75rem;">¡Restauración Completa!</h2>
        <p style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 1.5rem;">
          Se han limpiado e insertado los datos recuperados exitosamente en su base de datos.
        </p>
        <div style="text-align: left; background: var(--surface-solid); padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.9rem; color: var(--text-secondary);">
          - Jugadores restaurados: <?php echo count($players); ?><br>
          - Pronósticos guardados: <?php echo array_reduce($predictions, function($carry, $item) { return $carry + count($item); }, 0); ?><br>
          - Equipos definidos: <?php echo count($match_teams); ?><br>
          - Resultados oficiales actualizados: <?php echo count($real_results); ?>
        </div>
      </div>
      
      <a href="index.html" class="btn" style="text-align: center; text-decoration: none; display: block;">Volver a la Quiniela</a>
      <a href="recuperar_logs.php?logout=1" class="btn btn-secondary" style="text-align: center; text-decoration: none; display: block;">Cerrar Herramienta</a>
      
    <?php else: ?>
      <!-- Dashboard de Vista Previa -->
      <div class="nav-bar">
        <span class="nav-user">Sesión de Administrador Activa</span>
        <a href="recuperar_logs.php?logout=1" class="logout-link">Cerrar Sesión</a>
      </div>
      
      <?php if ($restore_error): ?>
        <div class="alert alert-danger">
          <strong>Error de base de datos:</strong> <?php echo htmlspecialchars($restore_error); ?>
        </div>
      <?php endif; ?>
      
      <?php if (!$log_found): ?>
        <div class="alert alert-danger" style="text-align: center;">
          <strong>Error:</strong> No se encontró el archivo de registro <code>api_debug.log</code> en este directorio.
        </div>
      <?php else: ?>
        <div class="alert alert-warning">
          <strong>Aviso de Reescritura:</strong> Al pulsar "Confirmar Restauración", se vaciarán las tablas de jugadores y predicciones actuales, y se insertarán los registros listados a continuación. Los resultados reales y equipos en eliminatorias se actualizarán.
        </div>

        <form method="POST">
          <input type="hidden" name="action" value="restore">
          
          <!-- Resumen de Reconstrucción -->
          <h2 style="font-size: 1.25rem; margin-bottom: 1rem; color: var(--text-primary);">Datos Extraídos del Registro</h2>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-number"><?php echo count($players); ?></div>
              <div class="summary-label">Jugadores</div>
            </div>
            <div class="summary-card">
              <div class="summary-number">
                <?php echo array_reduce($predictions, function($carry, $item) { return $carry + count($item); }, 0); ?>
              </div>
              <div class="summary-label">Pronósticos</div>
            </div>
            <div class="summary-card">
              <div class="summary-number"><?php echo count($match_teams); ?></div>
              <div class="summary-label">Llaves/Equipos</div>
            </div>
            <div class="summary-card">
              <div class="summary-number"><?php echo count($real_results); ?></div>
              <div class="summary-label">Resultados BD</div>
            </div>
          </div>
          
          <!-- Detalle de los Jugadores a Recuperar -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h2 style="font-size: 1.25rem; color: var(--text-primary);">Detalle de Participantes</h2>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">* Puedes editar los nombres antes de guardar</span>
          </div>
          
          <div class="preview-table-container">
            <table>
              <thead>
                <tr>
                  <th>ID Jugador</th>
                  <th>Nombre a Guardar (Editable)</th>
                  <th>Estado / Origen</th>
                  <th>Voto Campeón</th>
                  <th>Pronósticos</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($players as $p): ?>
                  <?php 
                    $pId = $p['id'];
                    $predCount = isset($predictions['p_' . $pId]) ? count($predictions['p_' . $pId]) : 0;
                    
                    // Mostrar campeón de base de datos si tiene, sino del log
                    $champPred = $p['champion_prediction'];
                    if (!$champPred && isset($existing_players['p_' . $pId]) && $existing_players['p_' . $pId]['champion_prediction']) {
                        $champPred = $existing_players['p_' . $pId]['champion_prediction'];
                    }
                    $vote = $champPred ? $champPred : '<em style="color: var(--text-muted);">Sin predicción</em>';
                    
                    // Determinar procedencia/estado para mostrar el badge
                    $badge_text = '';
                    $badge_class = '';
                    if ($p['auto_created']) {
                        $badge_text = 'Auto-Creado';
                        $badge_class = 'badge-auto';
                    } elseif (isset($existing_players['p_' . $pId])) {
                        $badge_text = 'En Base de Datos';
                        $badge_class = 'badge-db';
                    } else {
                        $badge_text = 'Oficial Predefinido';
                        $badge_class = 'badge-log';
                    }
                  ?>
                  <tr>
                    <td><code><?php echo htmlspecialchars($pId); ?></code></td>
                    <td>
                      <input type="text" name="player_names[<?php echo $pId; ?>]" value="<?php echo htmlspecialchars($p['name']); ?>" class="player-name-field" required autocomplete="off">
                    </td>
                    <td>
                      <span class="<?php echo $badge_class; ?>"><?php echo $badge_text; ?></span>
                    </td>
                    <td><?php echo $vote; ?></td>
                    <td style="font-weight: 700; color: var(--primary);"><?php echo $predCount; ?> / 104</td>
                  </tr>
                <?php endforeach; ?>
                <?php if (empty($players)): ?>
                  <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                      No se encontraron registros de jugadores en el log.
                    </td>
                  </tr>
                <?php endif; ?>
              </tbody>
            </table>
          </div>
          
          <!-- Botón de Acción -->
          <button type="submit" class="btn" <?php echo !$connected || empty($players) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''; ?>>
            Confirmar Restauración en Base de Datos
          </button>
        </form>
        
        <p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-top: 1.5rem;">
          Se procesaron <?php echo $total_lines_processed; ?> líneas de <code>api_debug.log</code>.
        </p>
      <?php endif; ?>
      
      <!-- Buscador en Logs -->
      <div style="margin-top: 3rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
        <h2 style="font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-primary);">🔍 Buscador en Registro (api_debug.log)</h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
          Ingresa el ID del jugador o una palabra clave para ver todas sus apariciones en el archivo de registro.
        </p>
        
        <form method="GET" action="recuperar_logs.php" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
          <input type="text" name="search" placeholder="Ej: 1781051937433 o Sussy" value="<?php echo htmlspecialchars($search_query); ?>" style="flex: 1; padding: 0.7rem 1rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
          <button type="submit" class="btn" style="width: auto; padding: 0 1.5rem;">Buscar</button>
        </form>
        
        <?php if ($search_query !== ''): ?>
          <h3 style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
            Resultados para "<?php echo htmlspecialchars($search_query); ?>": <?php echo count($search_results); ?> coincidencias
          </h3>
          <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.85rem; scrollbar-width: thin;">
            <?php foreach ($search_results as $res): ?>
              <div style="margin-bottom: 0.5rem; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.25rem;">
                <span style="color: var(--primary); font-weight: bold;">Línea <?php echo $res['line']; ?>:</span> 
                <?php echo htmlspecialchars($res['content']); ?>
              </div>
            <?php endforeach; ?>
            <?php if (empty($search_results)): ?>
              <div style="color: var(--text-muted); text-align: center; padding: 1rem;">
                No se encontró ninguna línea con ese término.
              </div>
            <?php endif; ?>
          </div>
        <?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
</body>
</html>
