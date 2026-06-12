<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar peticiones de pre-vuelo de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
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
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // Auto-creación de tabla si no existe
    $pdo->exec("CREATE TABLE IF NOT EXISTS quiniela_state (
        id INT PRIMARY KEY AUTO_INCREMENT,
        state_key VARCHAR(50) UNIQUE,
        state_value LONGTEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    $connected = true;
} catch (PDOException $e) {
    $conn_error = $e->getMessage();
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
        $stmt = $pdo->prepare("SELECT state_value FROM quiniela_state WHERE state_key = 'main_state'");
        $stmt->execute();
        $row = $stmt->fetch();

        if ($row) {
            echo $row['state_value'];
        } else {
            // Si no hay datos, devolver estructura vacía por defecto
            echo json_encode([
                'players' => [],
                'realResults' => new stdClass(),
                'config' => [
                    'pointsExact' => 3,
                    'pointsWinner' => 1,
                    'pointsClosest' => 1,
                    'adminPin' => '1234',
                    'theme' => 'dark'
                ]
            ]);
        }
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al leer datos: ' . $e->getMessage()]);
    }
} elseif ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    // Obtener JSON del body de la petición
    $input = file_get_contents('php://input');

    // Validar que sea JSON válido antes de guardar
    $json = json_decode($input, true);
    if ($json === null) {
        echo json_encode(['status' => 'error', 'message' => 'El cuerpo de la petición no es un JSON válido.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO quiniela_state (state_key, state_value) 
                               VALUES ('main_state', :value) 
                               ON DUPLICATE KEY UPDATE state_value = :value");
        $stmt->execute(['value' => $input]);
        echo json_encode(['status' => 'success', 'message' => 'Datos guardados correctamente en la base de datos.']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Error al guardar datos: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Acción no soportada. Use action=get o action=save.']);
}
