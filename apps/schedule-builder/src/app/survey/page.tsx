import { QuestionnareForm } from "~/components/survey/QuestionnaireForm";
import { Navbar } from "~/components/Navbar";
const page = () => {
  return (
    // PAGE CONTAINER
    <>
      <Navbar />
      <div className="flex min-h-screen min-w-screen items-center justify-center overflow-x-hidden pb-32">
        {/* MODAL CONTAINER */}
        <main className="sm:border-edge sm:bg-surface flex w-full flex-col rounded-xl sm:my-20 sm:flex-row sm:border sm:shadow-lg lg:mx-34 lg:max-w-5xl">
          {/* LEFT SECTION */}
          <div className="flex min-w-min justify-center sm:w-2/5 sm:p-8 sm:pt-32 sm:pb-60 md:px-12">
            <h1 className="font-display z-10 text-7xl font-semibold">
              Let&apos;s Get <br />
              You <br /> Started!
            </h1>
          </div>
          {/* RIGHT SECTION */}
          <div className="sm:bg-surface-muted/50 flex flex-1 items-center justify-center rounded-r-xl p-8 lg:p-20">
            <QuestionnareForm />
          </div>
        </main>
      </div>
    </>
  );
};

export default page;
