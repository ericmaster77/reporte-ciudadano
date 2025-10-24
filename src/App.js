import React, { useState, useEffect } from 'react';
import { MapPin, Camera, BarChart3, List, Upload, AlertCircle } from 'lucide-react';

const BachesApp = () => {
  const [view, setView] = useState('map');
  const [reports, setReports] = useState([]);
  const [newReport, setNewReport] = useState({
    ubicacion: '',
    lat: null,
    lng: null,
    descripcion: '',
    severidad: 'media',
    foto: null
  });
  const [selectedZone, setSelectedZone] = useState('todas');

  const MIAHUATLAN_CENTER = { lat: 16.3219, lng: -96.5958 };

  const zones = ['Centro', 'Norte', 'Sur', 'Este', 'Oeste', 'Periferia'];

  useEffect(() => {
    const saved = localStorage.getItem('baches-reports');
    if (saved) {
      setReports(JSON.parse(saved));
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setNewReport(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
        },
        () => {
          setNewReport(prev => ({
            ...prev,
            lat: MIAHUATLAN_CENTER.lat,
            lng: MIAHUATLAN_CENTER.lng
          }));
        }
      );
    }
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewReport(prev => ({ ...prev, foto: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

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

  const handleSubmit = () => {
    if (!newReport.ubicacion || !newReport.lat || !newReport.lng) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }
    
    const report = {
      id: Date.now(),
      ...newReport,
      zona: determineZone(newReport.lat, newReport.lng),
      fecha: new Date().toISOString(),
      estado: 'pendiente'
    };

    const updatedReports = [...reports, report];
    setReports(updatedReports);
    localStorage.setItem('baches-reports', JSON.stringify(updatedReports));

    setNewReport({
      ubicacion: '',
      lat: newReport.lat,
      lng: newReport.lng,
      descripcion: '',
      severidad: 'media',
      foto: null
    });

    alert('¡Reporte enviado exitosamente!');
    setView('list');
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

  const filteredReports = selectedZone === 'todas' 
    ? reports 
    : reports.filter(r => r.zona === selectedZone);

  const stats = getStatsByZone();

  const exportToGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      features: reports.map(report => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [report.lng, report.lat]
        },
        properties: {
          id: report.id,
          ubicacion: report.ubicacion,
          descripcion: report.descripcion,
          severidad: report.severidad,
          zona: report.zona,
          fecha: report.fecha,
          estado: report.estado
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baches-miahuatlan-${new Date().toISOString().split('T')[0]}.geojson`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Sistema de Reporte de Baches
              </h1>
              <p className="text-sm text-gray-600">
                Miahuatlán de Porfirio Díaz, Oaxaca
              </p>
            </div>
            <button
              onClick={exportToGeoJSON}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload size={18} />
              Exportar GeoJSON
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
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
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                view === 'report' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Camera size={20} />
              Reportar
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
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
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                view === 'stats' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <BarChart3 size={20} />
              Estadísticas
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'map' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Mapa de Baches Reportados</h2>
            
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

            <div className="bg-gray-100 rounded-lg p-8 min-h-[500px] relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MapPin size={48} className="mx-auto text-blue-600 mb-4" />
                  <p className="text-gray-600 mb-2">Vista de mapa interactivo</p>
                  <p className="text-sm text-gray-500">
                    {filteredReports.length} baches reportados
                  </p>
                </div>
              </div>

              <div className="relative h-full">
                {filteredReports.slice(0, 10).map((report, idx) => (
                  <div
                    key={report.id}
                    className="absolute"
                    style={{
                      left: `${20 + (idx % 5) * 15}%`,
                      top: `${20 + Math.floor(idx / 5) * 30}%`
                    }}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 border-white shadow-lg cursor-pointer ${
                      report.severidad === 'alta' ? 'bg-red-500' :
                      report.severidad === 'media' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`} title={report.ubicacion} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span>Severidad Alta</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                <span>Severidad Media</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span>Severidad Baja</span>
              </div>
            </div>
          </div>
        )}

        {view === 'report' && (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-6">Reportar Nuevo Bache</h2>
            
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
                    Latitud *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newReport.lat || ''}
                    onChange={(e) => setNewReport({...newReport, lat: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitud *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newReport.lng || ''}
                    onChange={(e) => setNewReport({...newReport, lng: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Severidad
                </label>
                <select
                  value={newReport.severidad}
                  onChange={(e) => setNewReport({...newReport, severidad: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="baja">Baja - Bache pequeño</option>
                  <option value="media">Media - Bache mediano</option>
                  <option value="alta">Alta - Bache grande o peligroso</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
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
                  Fotografía
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label htmlFor="photo-upload" className="cursor-pointer">
                    {newReport.foto ? (
                      <img src={newReport.foto} alt="Preview" className="max-h-48 mx-auto rounded" />
                    ) : (
                      <div>
                        <Camera size={48} className="mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600">Click para tomar/subir foto</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Enviar Reporte
              </button>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
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
                    <div className="flex gap-4">
                      {report.foto && (
                        <img src={report.foto} alt="Bache" className="w-32 h-32 object-cover rounded" />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{report.ubicacion}</h3>
                            <p className="text-sm text-gray-600">Zona: {report.zona}</p>
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
                        <div className="flex gap-4 text-sm text-gray-500">
                          <span>📍 {report.lat.toFixed(4)}, {report.lng.toFixed(4)}</span>
                          <span>📅 {new Date(report.fecha).toLocaleDateString('es-MX')}</span>
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
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-green-600">
                      {reports.filter(r => r.severidad === 'baja').length}
                    </p>
                    <p className="text-sm text-gray-600">Severidad Baja</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="font-semibold text-lg mb-4">Información de Exportación</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  Los datos pueden exportarse en formato GeoJSON compatible con sistemas GIS como:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  <li>QGIS - Software GIS de código abierto</li>
                  <li>ArcGIS - Plataforma líder en análisis espacial</li>
                  <li>Google Earth - Visualización 3D</li>
                  <li>Mapbox - Mapas interactivos personalizados</li>
                  <li>Leaflet - Biblioteca JavaScript para mapas</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BachesApp;