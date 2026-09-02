"use strict";

// GPX/KML parsing plus journey JSON/KML export conversion.

function kmlPointsFromCoordinates(coordinatesNode) {
  return coordinatesNode.textContent
    .trim()
    .split(/\s+/)
    .map(item => {
      const [lon, lat] = item.split(",").map(Number);
      return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
    })
    .filter(Boolean);
}

function firstText(container, selector) {
  return container.querySelector(selector)?.textContent?.trim() || "";
}

function parseKmlRoutes(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("The KML file could not be parsed.");
  }

  const documentName = firstText(doc, "Document > name, kml > name, name") || "Untitled Map";
  const routes = [];
  const placemarks = [...doc.querySelectorAll("Placemark")];
  placemarks.forEach((placemark, index) => {
    const coordinatesNodes = [...placemark.querySelectorAll("LineString coordinates, gx\\:Track coord, MultiGeometry LineString coordinates")];
    const points = coordinatesNodes.flatMap(node => {
      if (node.localName === "coord") {
        const [lon, lat] = node.textContent.trim().split(/\s+/).map(Number);
        return Number.isFinite(lon) && Number.isFinite(lat) ? [{ lon, lat }] : [];
      }
      return kmlPointsFromCoordinates(node);
    });
    if (points.length >= 2) {
      routes.push({
        title: firstText(placemark, "name") || `${documentName} ${index + 1}`,
        points
      });
    }
  });

  if (!routes.length) {
    const coordinatesNodes = [...doc.querySelectorAll("LineString coordinates, coordinates")];
    coordinatesNodes.forEach((node, index) => {
      const points = kmlPointsFromCoordinates(node);
      if (points.length >= 2) {
        routes.push({
          title: index === 0 ? documentName : `${documentName} ${index + 1}`,
          points
        });
      }
    });
  }

  if (!routes.length) {
    throw new Error("No coordinates were found in this KML file.");
  }

  return routes;
}

function parseKml(text) {
  return parseKmlRoutes(text)[0];
}

function gpxPointsFromNodes(nodes) {
  return nodes
    .map(node => {
      const lat = Number(node.getAttribute("lat"));
      const lon = Number(node.getAttribute("lon"));
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    })
    .filter(Boolean);
}

function parseGpxRoutes(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("The GPX file could not be parsed.");
  }

  const fileName = firstText(doc, "metadata > name, gpx > name, name") || "GPX Route";
  const routes = [];
  [...doc.getElementsByTagNameNS("*", "trk")].forEach((track, index) => {
    const points = gpxPointsFromNodes([...track.getElementsByTagNameNS("*", "trkpt")]);
    if (points.length >= 2) {
      routes.push({
        title: firstText(track, "name") || `${fileName} ${index + 1}`,
        points
      });
    }
  });
  [...doc.getElementsByTagNameNS("*", "rte")].forEach((route, index) => {
    const points = gpxPointsFromNodes([...route.getElementsByTagNameNS("*", "rtept")]);
    if (points.length >= 2) {
      routes.push({
        title: firstText(route, "name") || `${fileName} ${routes.length + index + 1}`,
        points
      });
    }
  });

  if (!routes.length) {
    const points = gpxPointsFromNodes([
      ...doc.getElementsByTagNameNS("*", "trkpt"),
      ...doc.getElementsByTagNameNS("*", "rtept")
    ]);
    if (points.length >= 2) {
      routes.push({ title: fileName, points });
    }
  }

  if (!routes.length) {
    throw new Error("The GPX route needs at least two points.");
  }

  return routes;
}

function parseGpx(text) {
  return parseGpxRoutes(text)[0];
}

function parseRouteFileRoutes(text, sourceLabel = "") {
  return sourceLabel.toLowerCase().endsWith(".gpx") || text.trimStart().startsWith("<?xml") && text.includes("<gpx")
    ? parseGpxRoutes(text)
    : parseKmlRoutes(text);
}

function parseRouteFile(text, sourceLabel = "") {
  return parseRouteFileRoutes(text, sourceLabel)[0];
}



function serializeSelectedTrips(indexes) {
  const selected = new Set(indexes);
  return serializeTrips().filter((trip, index) => selected.has(index));
}

function getJourneysExportPayload(indexes = null) {
  if (indexes === null) {
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      activeTripGroupIndex: state.activeTripGroupIndex || 0,
      activeTripIndex: state.activeTripIndex,
      activeRouteIndex: state.activeRouteIndex,
      tripGroups: (state.tripGroups || []).map(group => ({
        id: group.id,
        name: group.name,
        activeJourneyIndex: group.activeJourneyIndex || 0,
        journeys: serializeTrips(group.journeys)
      }))
    };
  }
  const trips = serializeSelectedTrips(indexes);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    activeTripIndex: clamp(indexes.indexOf(state.activeTripIndex), 0, Math.max(0, trips.length - 1)),
    activeRouteIndex: state.activeRouteIndex,
    trips
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function kmlCoordinates(points = []) {
  return points
    .filter(point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
    .map(point => `${point.lon.toFixed(6)},${point.lat.toFixed(6)},0`)
    .join(" ");
}

function journeyRouteKml(route, index) {
  const points = (route.points?.length ? route.points : route.displayPoints || [])
    .filter(point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  if (!points.length) return "";
  const name = escapeXml(route.label || route.title || `Day ${index + 1}`);
  const description = escapeXml(route.summary || route.source || "");
  if (points.length === 1 || route.isRestDay) {
    const point = points[points.length - 1];
    return `
      <Placemark>
        <name>${name}</name>
        <description>${description}</description>
        <Point><coordinates>${point.lon.toFixed(6)},${point.lat.toFixed(6)},0</coordinates></Point>
      </Placemark>`;
  }
  return `
      <Placemark>
        <name>${name}</name>
        <description>${description}</description>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${kmlCoordinates(points)}</coordinates>
        </LineString>
      </Placemark>`;
}

function journeysToKml(trips) {
  const folders = trips.map(trip => `
    <Folder>
      <name>${escapeXml(trip.name || "Journey")}</name>
      ${(trip.days || []).map(journeyRouteKml).join("")}
    </Folder>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>RV Map Journeys</name>${folders}
  </Document>
</kml>
`;
}
