import { serve } from "https://deno.land/std@0.142.0/http/server.ts";

async function fetchWeatherReport(lat: number, lon: number) {
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`);

    return res.json();
}

async function getPositionForPlaceName (placeName: string): Promise<{ name: string, lat: number, lon: number }> {
    const res = await fetch(`https://www.yr.no/api/v0/locations/suggest?language=nb&q=${placeName}`);
    const json = await res.json();

    if (json.totalResults === 0) {
        throw new Error('404');
    }

    const { name, position } = json._embedded.location[0];
    const { lat, lon } = position;

    return { lat, lon, name };
}

async function getPlaceNameSuggetions (q: string) {
    const res = await fetch(`https://www.yr.no/api/v0/locations/suggest?language=nb&q=${q}`);
    const json = await res.json();

    console.log(q, json);

    if (json.totalResults === 0) {
        throw new Error('404');
    }

    return json._embedded.location;
}


const html = String.raw;

function renderSearchPage() {
    return Deno.readTextFile('search-page.html');
}

function renderPage (weatherReport: Object): string {
    const forecast = weatherReport.properties.timeseries[0].data;
    const symbol = forecast.next_1_hours.summary.symbol_code;

    const altitude = weatherReport.geometry.coordinates[2];
    const uvIndex = forecast.instant.details.ultraviolet_index_clear_sky;
    const cloudAreaFraction = forecast.instant.details.cloud_area_fraction;
    const temperature = forecast.instant.details.air_temperature;

    return html`
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>Vädret i ${weatherReport.properties.meta.name}</title>
                <link rel="stylesheet" href="style.css">
            </head>
            <body>
                <header>
                    <h1>Vädret i ${weatherReport.properties.meta.name}</h1>
                </header>
                <figure>
                    <img src="https://api.met.no/images/weathericons/svg/${symbol}.svg">
                </figure>
                <table>
                    <caption>Prognos</caption>
                    <thead>
                    ${weatherReport.properties.timeseries.map(ts => html`
                        <th><local-time datetime="${ts.time}">${ts.time}</local-time></th>
                    `).join('')}
                    </thead>
                    <tbody>
                    ${weatherReport.properties.timeseries.map(ts => html`
                        <tr>
                            ${Object.entries(ts.data.instant.details).map(([key, value]) => html`
                                <th>${key}</th>
                                <td>${value}</td>
                            `).join('')}
                        </tr>
                    `).join('')}
                    </tbody>
                </table>
                <script src="https://cdn.skypack.dev/@github/time-elements" type="module"></script>
            </body>
        </html>
    `;
}

async function handleRequest(req: Request) {
    const url = new URL(req.url);
    const [, path] = url.pathname.split('/');
    const q = url.searchParams.get('q');

    if (path === "style.css") {
        const body = await Deno.readTextFile('style.css');

        return new Response(body, {
            status: 200,
            headers: new Headers({
                'Content-Type': 'text/css',
            })
        });
    }

    if (path === "" && !q) {
        const body = await renderSearchPage();

        return new Response(body, {
            status: 200,
            headers: new Headers({
                'Content-Type': 'text/html',
            })
        });
    }

    if (path === "suggestions") {
        try {
            const suggestions = await getPlaceNameSuggetions(q);

            return new Response(JSON.stringify(suggestions), {
                status: 200,
                headers: new Headers({
                    'Content-Type': 'application/json',
                })
            });
        } catch (e) {
            return new Response(null, {
                status: 404
            });
        }
    }

    const { lat, lon, name } = await getPositionForPlaceName(path || q);
    const weatherReport = await fetchWeatherReport(lat, lon);

    weatherReport.properties.meta.name = name;

    return new Response(renderPage(weatherReport), {
        status: 200,
        headers: new Headers({
            'Content-Type': 'text/html',
        })
    });
}

serve(handleRequest);
