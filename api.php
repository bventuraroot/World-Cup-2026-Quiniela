<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar peticiones de pre-vuelo de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// =========================================================================
// CONFIGURACIÓN DE LA BASE DE DATOS (MYSQL)
// =========================================================================
// Rellena estos campos con los datos de la base de datos que crees en tu cPanel:
$db_host = 'localhost';             // Usualmente 'localhost' en cPanel
$db_name = 'vsystemsv_ria';      // Reemplaza con el nombre de tu base de datos
$db_user = 'vsystemsv_ria';     // Reemplaza con tu usuario de base de datos
$db_pass = 'Ria2026/*';  // Reemplaza con la contraseña de tu usuario
// =========================================================================

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
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Error de conexión a la base de datos. Por favor, edita api.php con tus credenciales de cPanel. Detalles: ' . $e->getMessage()
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
