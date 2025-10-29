import React, { useState, useEffect } from 'react';
import { MapPin, Camera, BarChart3, List, Upload, AlertCircle, TrendingUp, RefreshCw, Zap, Loader } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { reportesService } from './firebaseConfig';

const BachesApp = () => {
  const [view, setView] = useState('map');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [newReport, setNewReport] = useState({
    ubicacion: '',
    lat: null,
    lng: null,
    descripcion: '',
    severidad: 'media',
    foto: null,
    deteccionAutomatica: false,
    confianzaIA: null
  });
  const [multipleDetections, setMultipleDetections] = useState([]);
  const [selectedZone, setSelectedZone] = useState('todas');
  const [mapInstance, setMapInstance] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  const MIAHUATLAN_CENTER = { lat: 16.3219, lng: -96.5958 };
  const zones = ['Centro', 'Norte', 'Sur', 'Este', 'Oeste', 'Periferia'];

  useEffect(() => {
    cargarReportes();
    obtenerUbicacionPrecisa();
  }, []);

  const cargarReportes = async () => {
    setLoading(true);
    try {
      const reportesData = await reportesService.obtenerTodos();
      setReports(reportesData);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
      alert('Error al cargar reportes. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  const obtenerUbicacionPrecisa = () => {
    setGpsError(null);
    
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización');
      return;
    }

    // Opciones para alta precisión
    const opciones = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setNewReport(prev => ({
          ...prev,
          lat: latitude,
          lng: longitude
        }));
        setGpsAccuracy(accuracy);
        console.log(`GPS obtenido - Precisión: ${accuracy.toFixed(2)}m`);
      },
      (error) => {
        let mensaje = 'Error al obtener ubicación';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            mensaje = 'Permiso de ubicación denegado. Por favor, habilita el GPS.';
            break;
          case error.POSITION_UNAVAILABLE:
            mensaje = 'Ubicación no disponible. Intenta en exterior.';
            break;
          case error.TIMEOUT:
            mensaje = 'Tiempo de espera agotado. Intenta de nuevo.';
            break;
        }
        setGpsError(mensaje);
        // Usar ubicación por defecto
        setNewReport(prev => ({
          ...prev,
          lat: MIAHUATLAN_CENTER.lat,
          lng: MIAHUATLAN_CENTER.lng
        }));
      },
      opciones
    );

    //Watch position para actualización continua
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (accuracy < 50) { // Solo actualizar si precisión < 50m
          setNewReport(prev => ({
            ...prev,
            lat: latitude,
            lng: longitude
          }));
          setGpsAccuracy(accuracy);
        }
      },
      null,
      opciones
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  const analizarImagenConIA = async (imagenBase64) => {
    setAnalyzingImage(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: imagenBase64.split(',')[1]
                  }
                },
                {
                  type: "text",
                  text: `Analiza esta imagen de una calle o carretera y detecta baches.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni markdown.

Instrucciones:
1. Identifica si hay uno o múltiples baches visibles
2. Para cada bache detectado, estima:
   - Severidad: "baja" (pequeño, < 30cm), "media" (mediano, 30-60cm), "alta" (grande o profundo, >60cm)
   - Posición aproximada en la imagen: "centro", "izquierda", "derecha", "arriba", "abajo"
   - Distancia estimada del punto de captura: "cerca" (<5m), "medio" (5-15m), "lejos" (>15m)
   - Confianza de la detección: número entre 0 y 1

Formato de respuesta (JSON válido):
{
  "baches_detectados": [
    {
      "severidad": "alta",
      "posicion": "centro",
      "distancia": "cerca",
      "confianza": 0.95,
      "descripcion": "Bache profundo en el centro del carril"
    }
  ],
  "es_foto_panoramica": true,
  "calidad_imagen": "buena",
  "visibilidad": "clara",
  "observaciones": "Se observa deterioro general del pavimento"
}`
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      let analisisTexto = data.content[0].text;
      
      // Limpiar markdown si existe
      analisisTexto = analisisTexto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const analisis = JSON.parse(analisisTexto);
      
      return analisis;
    } catch (error) {
      console.error('Error en análisis de IA:', error);
      throw error;
    } finally {
      setAnalyzingImage(false);
    }
  };

  const calcularCoordenadasBache = (gpsBase, posicion, distancia, heading = 0) => {
    // Constantes para cálculo
    const EARTH_RADIUS = 6371000; // metros
    
    // Distancia en metros según clasificación
    let distanciaMetros = 3;
    switch(distancia) {
      case 'cerca': distanciaMetros = 3; break;
      case 'medio': distanciaMetros = 10; break;
      case 'lejos': distanciaMetros = 20; break;
    }
    
    // Ángulo según posición (asumiendo foto hacia el norte si no hay heading)
    let angulo = heading;
    switch(posicion) {
      case 'centro': angulo += 0; break;
      case 'izquierda': angulo -= 45; break;
      case 'derecha': angulo += 45; break;
      case 'arriba': angulo += 0; break;
      case 'abajo': angulo += 180; break;
    }
    
    // Convertir a radianes
    const anguloRad = (angulo * Math.PI) / 180;
    
    // Calcular nueva posición
    const deltaLat = (distanciaMetros * Math.cos(anguloRad)) / EARTH_RADIUS * (180 / Math.PI);
    const deltaLng = (distanciaMetros * Math.sin(anguloRad)) / 
                     (EARTH_RADIUS * Math.cos(gpsBase.lat * Math.PI / 180)) * (180 / Math.PI);
    
    return {
      lat: gpsBase.lat + deltaLat,
      lng: gpsBase.lng + deltaLng
    };
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imagenBase64 = reader.result;
      setNewReport(prev => ({ ...prev, foto: imagenBase64 }));

      // Analizar imagen automáticamente con IA
      try {
        const analisis = await analizarImagenConIA(imagenBase64);
        
        if (analisis.baches_detectados && analisis.baches_detectados.length > 0) {
          const primerBache = analisis.baches_detectados[0];
          
          // Si es foto panorámica con múltiples baches
          if (analisis.es_foto_panoramica && analisis.baches_detectados.length > 1) {
            const detecciones = analisis.baches_detectados.map((bache, idx) => {
              const coords = calcularCoordenadasBache(
                { lat: newReport.lat, lng: newReport.lng },
                bache.posicion,
                bache.distancia
              );
              
              return {
                id: Date.now() + idx,
                ...coords,
                severidad: bache.severidad,
                descripcion: bache.descripcion,
                confianza: bache.confianza,
                ubicacion: `${newReport.ubicacion} - Bache ${idx + 1}`
              };
            });
            
            setMultipleDetections(detecciones);
            alert(`¡Se detectaron ${detecciones.length} baches en la foto! Revisa la lista para crear reportes individuales.`);
          } else {
            // Un solo bache
            setNewReport(prev => ({
              ...prev,
              severidad: primerBache.severidad,
              descripcion: primerBache.descripcion || prev.descripcion,
              deteccionAutomatica: true,
              confianzaIA: primerBache.confianza
            }));
            
            alert(`✨ Bache detectado automáticamente!\n` +
                  `Severidad: ${primerBache.severidad}\n` +
                  `Confianza: ${(primerBache.confianza * 100).toFixed(0)}%\n\n` +
                  `Puedes ajustar estos valores si lo deseas.`);
          }
        } else {
          alert('No se detectaron baches en la imagen. Puedes ingresar los datos manualmente.');
        }
      } catch (error) {
        console.error('Error analizando imagen:', error);
        alert('Error al analizar la imagen. Puedes continuar ingresando los datos manualmente.');
      }
    };
    reader.readAsDataURL(file);
  };

  const crearReporteDesdeDeteccion = async (deteccion) => {
    try {
      setLoading(true);
      const report = {
        id: deteccion.id,
        ubicacion: deteccion.ubicacion,
        lat: deteccion.lat,
        lng: deteccion.lng,
        descripcion: deteccion.descripcion,
        severidad: deteccion.severidad,
        zona: determineZone(deteccion.lat, deteccion.lng),
        fecha: new Date().toISOString(),
        estado: 'pendiente',
        foto: newReport.foto,
        deteccionAutomatica: true,
        confianzaIA: deteccion.confianza
      };

      await reportesService.crear(report);
      alert(`Reporte creado para: ${deteccion.ubicacion}`);
      
      // Remover de la lista
      setMultipleDetections(prev => prev.filter(d => d.id !== deteccion.id));
      
      await cargarReportes();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'map' && !mapInstance) {
      initMap();
    }
    
    // Cleanup para evitar múltiples inicializaciones
    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
    };
  }, [view]);

  const initMap = () => {
    const mapDiv = document.getElementById('map-container');
    if (!mapDiv) return;

    // Limpiar cualquier mapa existente
    const existingMap = document.getElementById('leaflet-map');
    if (existingMap && existingMap._leaflet_id) {
      return; // Ya existe un mapa
    }

    mapDiv.innerHTML = `
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div id="leaflet-map" style="width: 100%; height: 500px; border-radius: 8px;"></div>
    `;

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const L = window.L;
      
      // Verificar que no exista ya el mapa
      const mapElement = document.getElementById('leaflet-map');
      if (!mapElement) return;
      if (mapElement._leaflet_id) {
        return; // Ya inicializado
      }
      
      const map = L.map('leaflet-map').setView([MIAHUATLAN_CENTER.lat, MIAHUATLAN_CENTER.lng], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const filtered = selectedZone === 'todas' ? reports : reports.filter(r => r.zona === selectedZone);
      
      filtered.forEach(report => {
        const color = report.severidad === 'alta' ? 'red' : 
                     report.severidad === 'media' ? 'orange' : 'green';
        
        const marker = L.circleMarker([report.lat, report.lng], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map);

        const iaTag = report.deteccionAutomatica ? 
          `<span style="background: #3B82F6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🤖 IA ${(report.confianzaIA * 100).toFixed(0)}%</span>` : '';

        const popupContent = `
          <div style="min-width: 200px;">
            <strong>${report.ubicacion}</strong> ${iaTag}<br/>
            <span style="color: ${color}">Severidad: ${report.severidad}</span><br/>
            ${report.descripcion ? `<p style="margin: 5px 0;">${report.descripcion}</p>` : ''}
            ${report.fotoURL ? `<img src="${report.fotoURL}" style="width: 100%; max-height: 150px; object-fit: cover; margin-top: 5px; border-radius: 4px;" />` : ''}
            <small>${new Date(report.fecha).toLocaleDateString('es-MX')}</small>
          </div>
        `;
        
        marker.bindPopup(popupContent);
      });

      setMapInstance(map);
    };
    document.head.appendChild(script);
  };

  useEffect(() => {
    if (view === 'map' && reports.length > 0) {
      // Reinicializar mapa cuando cambien filtros o reportes
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
      setTimeout(() => initMap(), 100);
    }
  }, [selectedZone, reports, view]);

  const determineZone = (lat, lng) => {
    const latDiff = lat - MIAHUATLAN_CENTER.lat;
    const lngDiff = lng - MIAHUATLAN_CENTER.lng;
    
    if (Math.abs(latDiff) < 0.005 && Math.abs(lngDiff) < 0.005) return 'Centro';
    if (latDiff > 0.01) return 'Norte';
    if (latDiff < -0.01) return 'Sur';
    if (lngDiff > 0.01) return 'Este';
    if (lngDiff < -0.01) return 'Oeste';
    return 'Periferia';
  };

  const handleSubmit = async () => {
    if (!newReport.ubicacion || !newReport.lat || !newReport.lng) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }
    
    setLoading(true);
    
    try {
      const report = {
        id: Date.now(),
        ...newReport,
        zona: determineZone(newReport.lat, newReport.lng),
        fecha: new Date().toISOString(),
        estado: 'pendiente',
        gpsAccuracy: gpsAccuracy
      };

      await reportesService.crear(report);
      
      setNewReport({
        ubicacion: '',
        lat: newReport.lat,
        lng: newReport.lng,
        descripcion: '',
        severidad: 'media',
        foto: null,
        deteccionAutomatica: false,
        confianzaIA: null
      });
      setMultipleDetections([]);

      alert('¡Reporte enviado exitosamente!');
      await cargarReportes();
      setView('list');
    } catch (error) {
      console.error('Error al crear reporte:', error);
      alert('Error al enviar el reporte. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const getStatsByZone = () => {
    const stats = {};
    zones.forEach(zone => {
      stats[zone] = { total: 0, alta: 0, media: 0, baja: 0 };
    });

    reports.forEach(report => {
      if (stats[report.zona]) {
        stats[report.zona].total++;
        stats[report.zona][report.severidad]++;
      }
    });

    return stats;
  };

  const getChartData = () => {
    const stats = getStatsByZone();
    return zones.map(zone => ({
      zona: zone,
      total: stats[zone].total,
      alta: stats[zone].alta,
      media: stats[zone].media,
      baja: stats[zone].baja
    }));
  };

  const getPieData = () => {
    return [
      { name: 'Alta', value: reports.filter(r => r.severidad === 'alta').length, color: '#EF4444' },
      { name: 'Media', value: reports.filter(r => r.severidad === 'media').length, color: '#F59E0B' },
      { name: 'Baja', value: reports.filter(r => r.severidad === 'baja').length, color: '#10B981' }
    ];
  };

  const getTimelineData = () => {
    const grouped = {};
    reports.forEach(report => {
      const date = new Date(report.fecha).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
      grouped[date] = (grouped[date] || 0) + 1;
    });
    return Object.entries(grouped).map(([fecha, cantidad]) => ({ fecha, cantidad })).slice(-10);
  };

  const filteredReports = selectedZone === 'todas' 
    ? reports 
    : reports.filter(r => r.zona === selectedZone);

  const stats = getStatsByZone();

  const exportToGeoJSON = async () => {
    try {
      const geojson = await reportesService.exportarGeoJSON();
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baches-miahuatlan-${new Date().toISOString().split('T')[0]}.geojson`;
      a.click();
    } catch (error) {
      console.error('Error al exportar:', error);
      alert('Error al exportar datos');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Zap className="text-yellow-500" size={28} />
                Sistema de Reporte de Baches IA
              </h1>
              <p className="text-sm text-gray-600">
                Miahuatlán de Porfirio Díaz • Detección automática con IA
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={cargarReportes}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                Actualizar
              </button>
              <button
                onClick={exportToGeoJSON}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Upload size={18} />
                Exportar
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto">
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                view === 'map' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <MapPin size={20} />
              Mapa
            </button>
            <button
              onClick={() => setView('report')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                view === 'report' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Camera size={20} />
              Reportar
              {multipleDetections.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {multipleDetections.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                view === 'list' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <List size={20} />
              Reportes ({reports.length})
            </button>
            <button
              onClick={() => setView('stats')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                view === 'stats' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <BarChart3 size={20} />
              Estadísticas
            </button>
            <button
              onClick={() => setView('charts')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                view === 'charts' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <TrendingUp size={20} />
              Gráficas
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {(loading || analyzingImage) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3">
              <Loader className="animate-spin text-blue-600" size={32} />
              <span className="text-lg">
                {analyzingImage ? '🤖 Analizando imagen con IA...' : 'Cargando...'}
              </span>
            </div>
          </div>
        )}

        {view === 'map' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Mapa Interactivo de Baches</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtrar por zona:
              </label>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="todas">Todas las zonas</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </div>

            <div id="map-container"></div>

            <div className="mt-4 flex gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span>Severidad Alta</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                <span>Severidad Media</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span>Severidad Baja</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-blue-600" />
                <span>Detectado por IA</span>
              </div>
            </div>
          </div>
        )}

        {view === 'report' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Camera size={24} />
                Reportar Nuevo Bache
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                📍 GPS automático • 🤖 Detección IA • 📸 Análisis panorámico
              </p>

              {/* Estado del GPS */}
              {gpsAccuracy && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    ✅ GPS activo - Precisión: {gpsAccuracy.toFixed(1)}m
                  </p>
                </div>
              )}

              {gpsError && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ {gpsError}
                  </p>
                  <button
                    onClick={obtenerUbicacionPrecisa}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Reintentar obtener ubicación
                  </button>
                </div>
              )}
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ubicación / Calle *
                  </label>
                  <input
                    type="text"
                    value={newReport.ubicacion}
                    onChange={(e) => setNewReport({...newReport, ubicacion: e.target.value})}
                    placeholder="Ej: Calle Hidalgo esquina con Morelos"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Latitud (automático)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={newReport.lat || ''}
                      onChange={(e) => setNewReport({...newReport, lat: parseFloat(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      readOnly={gpsAccuracy}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Longitud (automático)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={newReport.lng || ''}
                      onChange={(e) => setNewReport({...newReport, lng: parseFloat(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      readOnly={gpsAccuracy}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    Severidad
                    {newReport.deteccionAutomatica && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        🤖 Detectado por IA ({(newReport.confianzaIA * 100).toFixed(0)}%)
                      </span>
                    )}
                  </label>
                  <select
                    value={newReport.severidad}
                    onChange={(e) => setNewReport({...newReport, severidad: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="baja">🟢 Baja - Bache pequeño</option>
                    <option value="media">🟡 Media - Bache mediano</option>
                    <option value="alta">🔴 Alta - Bache grande o peligroso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción {newReport.deteccionAutomatica && '(sugerida por IA)'}
                  </label>
                  <textarea
                    value={newReport.descripcion}
                    onChange={(e) => setNewReport({...newReport, descripcion: e.target.value})}
                    placeholder="Describe el bache y cualquier detalle relevante..."
                    rows="4"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📸 Fotografía (con detección IA automática)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="photo-upload"
                      disabled={analyzingImage}
                    />
                    <label htmlFor="photo-upload" className="cursor-pointer">
                      {newReport.foto ? (
                        <div>
                          <img src={newReport.foto} alt="Preview" className="max-h-48 mx-auto rounded mb-2" />
                          {newReport.deteccionAutomatica && (
                            <div className="text-sm text-blue-600 font-medium">
                              ✨ Bache detectado automáticamente
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <Camera size={48} className="mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-1">
                            Click para tomar/subir foto
                          </p>
                          <p className="text-xs text-gray-500">
                            La IA analizará automáticamente la imagen
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading || analyzingImage}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload size={20} />
                      Enviar Reporte
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lista de detecciones múltiples */}
            {multipleDetections.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Zap className="text-yellow-500" />
                  Múltiples baches detectados ({multipleDetections.length})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  La IA detectó varios baches en la foto panorámica. Crea reportes individuales para cada uno:
                </p>
                <div className="space-y-3">
                  {multipleDetections.map((deteccion, idx) => (
                    <div key={deteccion.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold">Bache #{idx + 1}</h4>
                          <p className="text-sm text-gray-600">
                            Severidad: <span className={`font-medium ${
                              deteccion.severidad === 'alta' ? 'text-red-600' :
                              deteccion.severidad === 'media' ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>{deteccion.severidad}</span>
                          </p>
                          <p className="text-sm text-gray-600">
                            Confianza: {(deteccion.confianza * 100).toFixed(0)}%
                          </p>
                        </div>
                        <button
                          onClick={() => crearReporteDesdeDeteccion(deteccion)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Crear Reporte
                        </button>
                      </div>
                      <p className="text-sm text-gray-700">{deteccion.descripcion}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        📍 {deteccion.lat.toFixed(6)}, {deteccion.lng.toFixed(6)}
                      </p>
                    </div>
                  ))}
                  <button
                    onClick={() => setMultipleDetections([])}
                    className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Descartar todas las detecciones
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'list' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-bold">Reportes de Baches</h2>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="todas">Todas las zonas</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </div>

            {filteredReports.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                <p>No hay reportes aún</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReports.map(report => (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex gap-4 flex-col md:flex-row">
                      {report.fotoURL && (
                        <img src={report.fotoURL} alt="Bache" className="w-full md:w-32 h-32 object-cover rounded" />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                          <div>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              {report.ubicacion}
                              {report.deteccionAutomatica && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                                  <Zap size={12} />
                                  IA {(report.confianzaIA * 100).toFixed(0)}%
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600">Zona: {report.zona}</p>
                            {report.gpsAccuracy && (
                              <p className="text-xs text-gray-500">
                                GPS: ±{report.gpsAccuracy.toFixed(1)}m
                              </p>
                            )}
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            report.severidad === 'alta' ? 'bg-red-100 text-red-800' :
                            report.severidad === 'media' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {report.severidad.charAt(0).toUpperCase() + report.severidad.slice(1)}
                          </span>
                        </div>
                        <p className="text-gray-700 mb-2">{report.descripcion}</p>
                        <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
                          <span>📍 {report.lat.toFixed(4)}, {report.lng.toFixed(4)}</span>
                          <span>📅 {new Date(report.fecha).toLocaleDateString('es-MX')}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            report.estado === 'resuelto' ? 'bg-green-100 text-green-800' :
                            report.estado === 'en_revision' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {report.estado}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'stats' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-6">Estadísticas por Zona</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {zones.map(zone => (
                  <div key={zone} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3">{zone}</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-bold">{stats[zone].total}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-red-600">Alta:</span>
                        <span className="font-semibold">{stats[zone].alta}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-yellow-600">Media:</span>
                        <span className="font-semibold">{stats[zone].media}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">Baja:</span>
                        <span className="font-semibold">{stats[zone].baja}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-lg mb-4">Resumen General</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-blue-600">{reports.length}</p>
                    <p className="text-sm text-gray-600">Total Reportes</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-red-600">
                      {reports.filter(r => r.severidad === 'alta').length}
                    </p>
                    <p className="text-sm text-gray-600">Severidad Alta</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-600">
                      {reports.filter(r => r.severidad === 'media').length}
                    </p>
                    <p className="text-sm text-gray-600">Severidad Media</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-purple-600">
                      {reports.filter(r => r.deteccionAutomatica).length}
                    </p>
                    <p className="text-sm text-gray-600">Detectados por IA</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'charts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-6">Análisis Visual de Datos</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-semibold mb-4">Distribución por Severidad</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={getPieData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {getPieData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="font-semibold mb-4">Baches por Zona</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="zona" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="alta" fill="#EF4444" name="Alta" />
                      <Bar dataKey="media" fill="#F59E0B" name="Media" />
                      <Bar dataKey="baja" fill="#10B981" name="Baja" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-4">Tendencia de Reportes</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getTimelineData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cantidad" stroke="#3B82F6" strokeWidth={2} name="Reportes" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="font-semibold mb-4">Comparativa Total por Zona</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getChartData()} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="zona" type="category" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#3B82F6" name="Total de Baches" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow-lg p-6 border border-blue-200">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Zap className="text-yellow-500" />
                Tecnología de Detección con IA
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white rounded-lg p-4">
                  <div className="font-semibold mb-2">🎯 Detección Automática</div>
                  <p className="text-gray-600">
                    IA analiza cada foto para detectar baches automáticamente
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <div className="font-semibold mb-2">📸 Fotos Panorámicas</div>
                  <p className="text-gray-600">
                    Detecta múltiples baches en una sola imagen con ubicaciones calculadas
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <div className="font-semibold mb-2">📍 GPS de Alta Precisión</div>
                  <p className="text-gray-600">
                    Ubicación automática con reporte de precisión en metros
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BachesApp;