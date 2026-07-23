import Image from "next/image";
import { QuestionnareForm } from "~/components/survey/QuestionnaireForm";
import { Navbar } from "~/components/Navbar";
const page = () => {
  return (
    // PAGE CONTAINER
    <>
      <Navbar />
      <div className="min-w-screen flex min-h-screen items-center justify-center overflow-x-hidden pb-32">
        {/* MODAL CONTAINER */}
        <main className="lg:mx-34 sm:border-pink-100 sm:bg-pink-50 flex w-full flex-col rounded-lg sm:my-20 sm:flex-row sm:border-4 sm:shadow-2xl lg:max-w-5xl">
          {/* LEFT SECTION */}
          <div className="flex min-w-min justify-center sm:w-2/5 sm:p-8 sm:pb-60 sm:pt-32 md:px-12">
            <Image
              className="absolute"
              width={400}
              height={400}
              src="/images/paws.svg"
              alt={"paws overlay"}
              draggable="false"
            />
            <h1 className="text-stone-800 z-10 text-7xl font-bold">
              Let&apos;s Get <br />
              You <br /> Started!
            </h1>
          </div>
          {/* RIGHT SECTION */}
          <div className="flex flex-1 items-center justify-center p-8 sm:bg-white lg:p-20">
            <QuestionnareForm />
          </div>
        </main>
      </div>
    </>
  );
};

export default page;
