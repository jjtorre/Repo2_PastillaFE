// src/pages/Landing.tsx
// Cara pública del proyecto, en la raíz del dominio.
//
// Es lo primero que ve alguien que llega sin sesión: explica qué es Pastilla
// antes de pedirle nada. El panel del cuidador queda detrás del botón de
// entrar, porque un formulario de login como página de inicio no le dice a
// nadie qué está a punto de usar.

interface Props {
  onEnter: () => void;
}

const STEPS = [
  {
    n: '1',
    title: 'El paciente registra sus medicinas',
    body: 'Nombre, hora y cuántas pastillas quedan. La app le avisa qué toca hoy y marca cada dosis con un solo toque.',
  },
  {
    n: '2',
    title: 'Genera un código para su cuidador',
    body: 'Seis caracteres que puede dictar por teléfono. No hace falta que el cuidador instale nada ni comparta contraseñas.',
  },
  {
    n: '3',
    title: 'El cuidador lo ve desde su navegador',
    body: 'Entra aquí, escribe el código y ve el estado del día. Cuando el paciente marca una dosis, la pantalla se actualiza sola.',
  },
];

export default function Landing({ onEnter }: Readonly<Props>) {
  return (
    <div className="landing">
      <header className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">Pastilla</p>
          <h1 className="hero-title">Que nadie olvide su medicina</h1>
          <p className="hero-sub">
            Una app para quien toma los medicamentos y un panel web para quien
            se preocupa por él. Sin instalar nada del lado del cuidador.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={onEnter} className="hero-cta">
              Entrar al panel del cuidador
            </button>
            <a href="#como-funciona" className="hero-link">
              Ver cómo funciona
            </a>
          </div>
        </div>
      </header>

      <main className="container">
        <section aria-labelledby="problema">
          <h2 id="problema">El problema</h2>
          <p className="muted">
            Cuando alguien mayor vive solo, la familia acaba llamando cada día
            para preguntar lo mismo: «¿ya te tomaste la pastilla?». La respuesta
            depende de la memoria de quien contesta, que es justo lo que falla.
          </p>
        </section>

        <section aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="section-heading">
            Cómo funciona
          </h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.n} className="step">
                <span className="step-num" aria-hidden="true">
                  {step.n}
                </span>
                <div>
                  <h3 className="step-title">{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="mitades">
          <h2 id="mitades" className="section-heading">
            Dos mitades, un solo sistema
          </h2>
          <div className="split">
            <div className="card">
              <h3 className="card-title">Para el paciente</h3>
              <p className="muted">
                App en el teléfono, con texto grande y mucho contraste. Toca el
                círculo y la dosis queda marcada. No hay que registrarse ni
                recordar contraseñas.
              </p>
            </div>
            <div className="card">
              <h3 className="card-title">Para el cuidador</h3>
              <p className="muted">
                Esta misma página desde cualquier navegador. Lo atrasado
                aparece primero, con el porcentaje de cumplimiento de los
                últimos 30 días.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="offline" className="highlight">
          <h2 id="offline">Funciona sin internet</h2>
          <p className="muted">
            El teléfono no espera a la red para nada: las medicinas se guardan y
            se marcan aunque no haya señal. Cuando vuelve la conexión, todo se
            sincroniza solo. Una dosis marcada dos veces por un reintento sigue
            contando como una.
          </p>
        </section>

        <section aria-labelledby="privacidad">
          <h2 id="privacidad" className="section-heading">
            Cada familia ve solo lo suyo
          </h2>
          <p className="muted">
            Los datos están separados por hogar en la propia base de datos, no
            por lo que decida mostrar la aplicación. Un cuidador sin código no
            ve nada, y con código ve únicamente el hogar que le invitó.
          </p>
        </section>

        <div className="final-cta">
          <button type="button" onClick={onEnter}>
            Entrar al panel del cuidador
          </button>
        </div>
      </main>

      <footer className="footer">
        <p>Pastilla · Proyecto académico de ingeniería de software</p>
      </footer>
    </div>
  );
}
