// 1. Importar las herramientas de Firebase desde internet
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. TU CONFIGURACIÓN DE FIREBASE (¡Reemplaza esto con tus datos!)
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// 3. Inicializar Firebase y la Base de Datos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. Crear una "referencia" al lugar exacto donde guardaremos tus datos
// En este caso: una colección llamada 'usuarios' y un documento llamado 'mi_tablero'
const tableroRef = doc(db, "usuarios", "mi_tablero");

// --- FUNCIÓN PARA GUARDAR DATOS EN LA NUBE ---
async function guardarDatos(nuevoSaldo, nuevoXP) {
  try {
    await setDoc(tableroRef, {
      saldoPersonal: nuevoSaldo,
      estadoFisico: nuevoXP
    }, { merge: true }); // 'merge: true' actualiza solo lo que envías sin borrar el resto
    
    console.log("¡Datos guardados con éxito en Firebase!");
  } catch (error) {
    console.error("Error al guardar:", error);
  }
}

// --- FUNCIÓN PARA LEER DATOS DE LA NUBE (Cuando recargas la página) ---
async function cargarDatos() {
  try {
    const documento = await getDoc(tableroRef);
    
    if (documento.exists()) {
      const datos = documento.data();
      console.log("Datos recuperados de la nube:", datos);
      
      // AQUÍ ES DONDE ACTUALIZAS TU HTML
      // Ejemplo: si tienes un <span id="texto-saldo"> en tu HTML...
      // document.getElementById("texto-saldo").innerText = datos.saldoPersonal;
      
    } else {
      console.log("Aún no hay datos guardados. Es la primera vez.");
      // Opcional: Podrías llamar a guardarDatos() con valores en 0 aquí
    }
  } catch (error) {
    console.error("Error al cargar los datos:", error);
  }
}

// 5. Ejecutar la función de cargar apenas se abre o recarga la página
cargarDatos();


// --- EJEMPLO DE CÓMO USARLO EN TU PÁGINA ---
// Imagina que tienes un botón en tu HTML con id="btn-actualizar"
/*
document.getElementById("btn-actualizar").addEventListener("click", () => {
    // Al hacer clic, enviamos nuevos valores a Firebase
    guardarDatos(1500, 75); 
});
*/