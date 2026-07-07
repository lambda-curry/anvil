import { Command } from "commander";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
});

const program = new Command();

program
  .name("sample-cli")
  .description("Sample CLI")
  .option("-n, --name <value>", "Name")
  .action((opts) => {
    try {
      const parsed = schema.safeParse({ name: opts.name ?? "" });
      if (!parsed.success) {
        console.error("Invalid --name");
        process.exit(1);
      }
      console.log(`Hello, ${parsed.data.name}`);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program.parse(process.argv);
