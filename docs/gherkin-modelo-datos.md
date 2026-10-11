# Gherkin — Modelo de Datos y Comportamiento

Feature: Registro de carreras

  Scenario: Carrera completada por Uber
    Given una carrera activa en Uber
    When el conductor confirma el fin
    Then se guarda en SQLite con fuente api
    And se encola para sincronizar con Supabase

  Scenario: Carrera manual en DiDi o InDrive
    Given una carrera con tarifa, origen y destino
    When el conductor confirma con un toque
    Then se guarda en carreras con fuente manual y estado completada

  Scenario: Upsert por trip_id
    Given una carrera de Uber con trip_id
    When llega por la API
    Then se hace upsert por trip_id sin duplicar

  Scenario: Carrera en background
    Given una tarea de GPS activa
    When termina la carrera
    Then se guarda con fuente background

Feature: Dashboard

  Scenario: Visualizar meta diaria
    Given las carreras del día y los gastos fijos
    When se abre el dashboard
    Then se muestra el contador de carreras hechas vs faltantes
    And el valor acumulado vs la meta

Feature: Sincronización

  Scenario: Drenado de cola
    Given una carrera sin sincronizar
    When hay conexión
    Then SyncService la drena con upsert por updated_at

Feature: Open-closed

  Scenario: Plataforma nueva
    Given una plataforma nueva
    When se agrega
    Then es un INSERT en plataformas, no una migración
